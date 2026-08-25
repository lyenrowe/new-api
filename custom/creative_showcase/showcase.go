/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// Package creative_showcase contains the optional creative-case extension.
// It deliberately owns its schema and HTTP surface so core new-api upgrades
// need only keep the small router and migration registrations.
package creative_showcase

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func getAssetPrefix() string {
	return getEnv("CREATIVE_SHOWCASE_OSS_PREFIX", "creative-showcase/")
}
const maxLocalAssetSize = 500 << 20

type Category struct {
	ID        int64  `json:"id" gorm:"primaryKey"`
	Name      string `json:"name" gorm:"size:100;uniqueIndex;not null"`
	SortOrder int    `json:"sort_order" gorm:"not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Case struct {
	ID            int64  `json:"id" gorm:"primaryKey"`
	Title         string `json:"title" gorm:"size:200;not null"`
	Type          string `json:"type" gorm:"size:16;index;not null"`
	CategoryID    int64  `json:"category_id" gorm:"index;not null"`
	CoverKey      string `json:"cover_key" gorm:"type:text;not null"`
	MediaKey      string `json:"media_key" gorm:"type:text"`
	Prompt        string `json:"prompt" gorm:"type:text;not null"`
	Size          string `json:"size" gorm:"size:32"`
	AspectRatio   string `json:"aspect_ratio" gorm:"size:32"`
	Duration      int    `json:"duration"`
	Model         string `json:"model" gorm:"size:120"`
	Group         string `json:"group" gorm:"size:120"`
	StartFrame    string `json:"start_frame" gorm:"type:text"`
	EndFrame      string `json:"end_frame" gorm:"type:text"`
	Settings      string `json:"settings" gorm:"type:text"`
	ReferenceURLs string `json:"reference_urls" gorm:"type:text"`
	Featured      bool   `json:"featured" gorm:"index;not null"`
	Published     bool   `json:"published" gorm:"index;not null"`
	SortOrder     int    `json:"sort_order" gorm:"index;not null"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type caseResponse struct {
	ID            int64  `json:"id"`
	Title         string `json:"title"`
	Type          string `json:"type"`
	CategoryID    int64  `json:"category_id"`
	CoverURL      string `json:"cover_url"`
	CoverKey      string `json:"cover_key,omitempty"`
	MediaURL      string `json:"media_url,omitempty"`
	MediaKey      string `json:"media_key,omitempty"`
	Prompt        string `json:"prompt"`
	Size          string `json:"size,omitempty"`
	AspectRatio   string `json:"aspect_ratio,omitempty"`
	Duration      int    `json:"duration,omitempty"`
	Model         string `json:"model,omitempty"`
	Group         string `json:"group,omitempty"`
	StartFrame    string `json:"start_frame,omitempty"`
	EndFrame      string `json:"end_frame,omitempty"`
	StartFrameKey string `json:"start_frame_key,omitempty"`
	EndFrameKey   string `json:"end_frame_key,omitempty"`
	Settings      string `json:"settings,omitempty"`
	ReferenceURLs string `json:"reference_urls,omitempty"`
	Featured      bool   `json:"featured"`
	Published     bool   `json:"published"`
	SortOrder     int    `json:"sort_order"`
}

type caseInput struct {
	Title         string `json:"title" binding:"required,max=200"`
	Type          string `json:"type" binding:"required,oneof=image video"`
	CategoryID    int64  `json:"category_id" binding:"required"`
	CoverKey      string `json:"cover_key" binding:"required,max=500"`
	MediaKey      string `json:"media_key" binding:"max=500"`
	Prompt        string `json:"prompt" binding:"required,max=10000"`
	Size          string `json:"size" binding:"max=32"`
	AspectRatio   string `json:"aspect_ratio" binding:"max=32"`
	Duration      int    `json:"duration" binding:"min=0,max=600"`
	Model         string `json:"model" binding:"max=120"`
	Group         string `json:"group" binding:"max=120"`
	StartFrame    string `json:"start_frame" binding:"max=500"`
	EndFrame      string `json:"end_frame" binding:"max=500"`
	Settings      string `json:"settings" binding:"max=20000"`
	ReferenceURLs string `json:"reference_urls" binding:"max=20000"`
	Featured      bool   `json:"featured"`
	Published     bool   `json:"published"`
	SortOrder     int    `json:"sort_order"`
}

func Migrate(db *gorm.DB) error {
	if err := db.AutoMigrate(&Category{}, &Case{}); err != nil {
		return err
	}
	for index, name := range []string{"AI漫剧", "电商营销", "自媒体创作", "创意艺术"} {
		var count int64
		if err := db.Model(&Category{}).Where("name = ?", name).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			if err := db.Create(&Category{Name: name, SortOrder: index}).Error; err != nil {
				return err
			}
		}
	}
	var legacyHot Category
	if err := db.Where("name = ?", "热门案例").First(&legacyHot).Error; err == nil {
		var fallback Category
		if err := db.Order("sort_order asc, id asc").First(&fallback).Error; err != nil {
			return err
		}
		if err := db.Model(&Case{}).Where("category_id = ?", legacyHot.ID).Updates(map[string]any{"category_id": fallback.ID, "featured": true}).Error; err != nil {
			return err
		}
		if err := db.Delete(&legacyHot).Error; err != nil {
			return err
		}
	}
	return nil
}

func RegisterRoutes(api *gin.RouterGroup, db *gorm.DB, adminAuth gin.HandlerFunc) {
	public := api.Group("/creative-showcase")
	public.GET("/categories", listCategories(db))
	public.GET("/cases", listCases(db, false))
	public.GET("/assets/*key", serveLocalAsset)

	admin := api.Group("/creative-showcase/admin")
	admin.Use(adminAuth)
	admin.GET("/categories", listCategories(db))
	admin.POST("/categories", createCategory(db))
	admin.PUT("/categories/:id", updateCategory(db))
	admin.DELETE("/categories/:id", deleteCategory(db))
	admin.GET("/cases", listCases(db, true))
	admin.POST("/cases", createCase(db))
	admin.PUT("/cases/:id", updateCase(db))
	admin.DELETE("/cases/:id", deleteCase(db))
	admin.POST("/upload-credentials", uploadCredentials)
	admin.POST("/upload", uploadLocalAsset)
}

func listCategories(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var categories []Category
		if err := db.Order("sort_order asc, id asc").Find(&categories).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "Unable to load categories")
			return
		}
		respondOK(c, categories)
	}
}

func listCases(db *gorm.DB, includeUnpublished bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		if page < 1 {
			page = 1
		}
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
		if pageSize < 1 || pageSize > 60 {
			pageSize = 20
		}
		query := db.Model(&Case{})
		if !includeUnpublished {
			query = query.Where("published = ?", true)
		}
		if caseType := c.Query("type"); caseType == "image" || caseType == "video" {
			query = query.Where("type = ?", caseType)
		}
		if categoryID, err := strconv.ParseInt(c.Query("category_id"), 10, 64); err == nil && categoryID > 0 {
			query = query.Where("category_id = ?", categoryID)
		}
		if c.Query("featured") == "true" {
			query = query.Where("featured = ?", true)
		}
		var total int64
		if err := query.Count(&total).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "Unable to load cases")
			return
		}
		var cases []Case
		if err := query.Order("sort_order asc, id desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&cases).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "Unable to load cases")
			return
		}
		items := make([]caseResponse, 0, len(cases))
		for _, item := range cases {
			items = append(items, presentCase(item))
		}
		respondOK(c, gin.H{"items": items, "page": page, "page_size": pageSize, "total": total, "has_more": int64(page*pageSize) < total})
	}
}

func createCategory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input Category
		if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
			respondError(c, http.StatusBadRequest, "Category name is required")
			return
		}
		input.Name = strings.TrimSpace(input.Name)
		if err := db.Create(&input).Error; err != nil {
			respondError(c, http.StatusBadRequest, "Unable to create category")
			return
		}
		respondOK(c, input)
	}
}

func updateCategory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			respondError(c, http.StatusBadRequest, "Invalid category")
			return
		}
		var input Category
		if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
			respondError(c, http.StatusBadRequest, "Category name is required")
			return
		}
		if result := db.Model(&Category{}).Where("id = ?", id).Updates(map[string]any{"name": strings.TrimSpace(input.Name), "sort_order": input.SortOrder}); result.Error != nil || result.RowsAffected == 0 {
			respondError(c, http.StatusBadRequest, "Unable to update category")
			return
		}
		respondOK(c, gin.H{"id": id})
	}
}

func deleteCategory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			respondError(c, http.StatusBadRequest, "Invalid category")
			return
		}
		var count int64
		if err := db.Model(&Case{}).Where("category_id = ?", id).Count(&count).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "Unable to delete category")
			return
		}
		if count > 0 {
			respondError(c, http.StatusBadRequest, "Delete or move the category cases first")
			return
		}
		if result := db.Delete(&Category{}, id); result.Error != nil || result.RowsAffected == 0 {
			respondError(c, http.StatusNotFound, "Category not found")
			return
		}
		respondOK(c, nil)
	}
}

func createCase(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input caseInput
		if err := c.ShouldBindJSON(&input); err != nil {
			respondError(c, http.StatusBadRequest, "Invalid case data")
			return
		}
		item, ok := validateCaseInput(db, input, c)
		if !ok {
			return
		}
		if err := db.Create(&item).Error; err != nil {
			respondError(c, http.StatusInternalServerError, "Unable to create case")
			return
		}
		respondOK(c, presentCase(item))
	}
}

func updateCase(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			respondError(c, http.StatusBadRequest, "Invalid case")
			return
		}
		var input caseInput
		if err := c.ShouldBindJSON(&input); err != nil {
			respondError(c, http.StatusBadRequest, "Invalid case data")
			return
		}
		item, ok := validateCaseInput(db, input, c)
		if !ok {
			return
		}
		result := db.Model(&Case{}).Where("id = ?", id).Updates(item)
		if result.Error != nil || result.RowsAffected == 0 {
			respondError(c, http.StatusNotFound, "Case not found")
			return
		}
		item.ID = id
		respondOK(c, presentCase(item))
	}
}

func deleteCase(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			respondError(c, http.StatusBadRequest, "Invalid case")
			return
		}
		result := db.Delete(&Case{}, id)
		if result.Error != nil || result.RowsAffected == 0 {
			respondError(c, http.StatusNotFound, "Case not found")
			return
		}
		respondOK(c, nil)
	}
}

func validateCaseInput(db *gorm.DB, input caseInput, c *gin.Context) (Case, bool) {
	if !isAssetKey(input.CoverKey) || (input.MediaKey != "" && !isAssetKey(input.MediaKey)) || (input.StartFrame != "" && !isAssetKey(input.StartFrame)) || (input.EndFrame != "" && !isAssetKey(input.EndFrame)) {
		respondError(c, http.StatusBadRequest, "Invalid asset key")
		return Case{}, false
	}
	if input.Type == "video" && input.MediaKey == "" {
		respondError(c, http.StatusBadRequest, "Video cases require a video asset")
		return Case{}, false
	}
	if input.Settings != "" {
		var settings map[string]any
		if err := common.UnmarshalJsonStr(input.Settings, &settings); err != nil {
			respondError(c, http.StatusBadRequest, "Case settings must be a JSON object")
			return Case{}, false
		}
	}
	if input.ReferenceURLs != "" {
		var references []string
		if err := common.UnmarshalJsonStr(input.ReferenceURLs, &references); err != nil {
			respondError(c, http.StatusBadRequest, "Case reference URLs must be a JSON array")
			return Case{}, false
		}
		for _, reference := range references {
			parsed, err := url.Parse(reference)
			if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				respondError(c, http.StatusBadRequest, "Case reference URL is invalid")
				return Case{}, false
			}
		}
	}
	var count int64
	if err := db.Model(&Category{}).Where("id = ?", input.CategoryID).Count(&count).Error; err != nil || count == 0 {
		respondError(c, http.StatusBadRequest, "Category not found")
		return Case{}, false
	}
	return Case{Title: strings.TrimSpace(input.Title), Type: input.Type, CategoryID: input.CategoryID, CoverKey: input.CoverKey, MediaKey: input.MediaKey, Prompt: strings.TrimSpace(input.Prompt), Size: input.Size, AspectRatio: input.AspectRatio, Duration: input.Duration, Model: input.Model, Group: input.Group, StartFrame: input.StartFrame, EndFrame: input.EndFrame, Settings: input.Settings, ReferenceURLs: input.ReferenceURLs, Featured: input.Featured, Published: input.Published, SortOrder: input.SortOrder}, true
}

func presentCase(item Case) caseResponse {
	return caseResponse{ID: item.ID, Title: item.Title, Type: item.Type, CategoryID: item.CategoryID, CoverURL: assetURL(item.CoverKey), CoverKey: item.CoverKey, MediaURL: assetURL(item.MediaKey), MediaKey: item.MediaKey, Prompt: item.Prompt, Size: item.Size, AspectRatio: item.AspectRatio, Duration: item.Duration, Model: item.Model, Group: item.Group, StartFrame: assetURL(item.StartFrame), EndFrame: assetURL(item.EndFrame), StartFrameKey: item.StartFrame, EndFrameKey: item.EndFrame, Settings: item.Settings, ReferenceURLs: item.ReferenceURLs, Featured: item.Featured, Published: item.Published, SortOrder: item.SortOrder}
}
func isAssetKey(key string) bool {
	return strings.HasPrefix(key, getAssetPrefix()) && !strings.Contains(key, "..")
}
func assetURL(key string) string {
	if key == "" {
		return ""
	}
	if !ossConfigured() {
		return "/api/creative-showcase/assets/" + key
	}
	return strings.TrimSuffix(getEnv("CREATIVE_SHOWCASE_CDN_URL", "https://s.zhouyitoken.com"), "/") + "/" + strings.TrimPrefix(key, "/")
}

// PublicAssetURL resolves a showcase storage key for reuse by another
// authenticated feature without exposing the storage implementation.
func PublicAssetURL(key string) string {
	return assetURL(key)
}

// ReadLocalAsset returns a locally stored showcase asset. OSS-backed assets
// are intentionally read through their public URL instead.
func ReadLocalAsset(key string, limit int64) ([]byte, string, bool, error) {
	if ossConfigured() {
		return nil, "", false, nil
	}
	path, ok := localAssetPath(key)
	if !ok {
		return nil, "", false, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, "", true, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, "", true, err
	}
	if int64(len(data)) > limit {
		return nil, "", true, fmt.Errorf("showcase asset exceeds copy limit")
	}
	return data, http.DetectContentType(data), true, nil
}
func respondOK(c *gin.Context, data any) { c.JSON(http.StatusOK, gin.H{"success": true, "data": data}) }
func respondError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"success": false, "message": message})
}
func getEnv(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

type stsCredentials struct {
	AccessKeyID     string `xml:"AccessKeyId"`
	AccessKeySecret string `xml:"AccessKeySecret"`
	SecurityToken   string `xml:"SecurityToken"`
	Expiration      string `xml:"Expiration"`
}
type assumeRoleResponse struct {
	Credentials stsCredentials `xml:"Credentials"`
}

func uploadCredentials(c *gin.Context) {
	if !ossConfigured() {
		respondOK(c, gin.H{"mode": "local", "prefix": getAssetPrefix()})
		return
	}
	credentials, err := assumeRole(c.Request.Context())
	if err != nil {
		common.SysError(fmt.Sprintf("creative showcase: assume OSS role failed: %v", err))
		respondError(c, http.StatusServiceUnavailable, "Unable to create upload credentials")
		return
	}
	respondOK(c, gin.H{"mode": "oss", "access_key_id": credentials.AccessKeyID, "access_key_secret": credentials.AccessKeySecret, "security_token": credentials.SecurityToken, "expiration": credentials.Expiration, "bucket": getEnv("CREATIVE_SHOWCASE_OSS_BUCKET", ""), "region": getEnv("CREATIVE_SHOWCASE_OSS_REGION", ""), "prefix": getAssetPrefix()})
}

func ossConfigured() bool {
	return getEnv("CREATIVE_SHOWCASE_OSS_BUCKET", "") != "" && getEnv("CREATIVE_SHOWCASE_OSS_REGION", "") != "" && getEnv("CREATIVE_SHOWCASE_OSS_ROLE_ARN", "") != ""
}

func localAssetRoot() string {
	return getEnv("CREATIVE_SHOWCASE_LOCAL_DIR", "data")
}

func localAssetPath(key string) (string, bool) {
	if !isAssetKey(key) {
		return "", false
	}
	return filepath.Join(localAssetRoot(), filepath.FromSlash(key)), true
}

func serveLocalAsset(c *gin.Context) {
	if ossConfigured() {
		respondError(c, http.StatusNotFound, "Asset not found")
		return
	}
	key := strings.TrimPrefix(c.Param("key"), "/")
	path, ok := localAssetPath(key)
	if !ok {
		respondError(c, http.StatusNotFound, "Asset not found")
		return
	}
	c.File(path)
}

func uploadLocalAsset(c *gin.Context) {
	if ossConfigured() {
		respondError(c, http.StatusConflict, "Local upload is disabled when OSS is configured")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxLocalAssetSize)
	fileHeader, err := c.FormFile("file")
	if err != nil || fileHeader.Size == 0 {
		respondError(c, http.StatusBadRequest, "Asset file is required")
		return
	}
	if fileHeader.Size > maxLocalAssetSize {
		respondError(c, http.StatusRequestEntityTooLarge, "Asset exceeds the 500 MB limit")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		respondError(c, http.StatusBadRequest, "Unable to read asset")
		return
	}
	defer file.Close()
	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = mime.TypeByExtension(strings.ToLower(filepath.Ext(fileHeader.Filename)))
	}
	if !strings.HasPrefix(contentType, "image/") && !strings.HasPrefix(contentType, "video/") {
		respondError(c, http.StatusBadRequest, "Only image and video assets are supported")
		return
	}
	extension := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if extension == "" || len(extension) > 12 {
		respondError(c, http.StatusBadRequest, "Asset must have a valid file extension")
		return
	}
	key := getAssetPrefix() + time.Now().UTC().Format("2006-01-02") + "/" + uuid.NewString() + extension
	path, ok := localAssetPath(key)
	if !ok {
		respondError(c, http.StatusInternalServerError, "Unable to prepare local asset storage")
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		respondError(c, http.StatusInternalServerError, "Unable to create local asset storage")
		return
	}
	destination, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Unable to store asset")
		return
	}
	_, copyErr := io.Copy(destination, file)
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		respondError(c, http.StatusInternalServerError, "Unable to store asset")
		return
	}
	respondOK(c, gin.H{"key": key, "url": assetURL(key)})
}

func assumeRole(ctx context.Context) (stsCredentials, error) {
	accessKeyID, accessKeySecret := getEnv("ALIYUN_ACCESS_KEY_ID", ""), getEnv("ALIYUN_ACCESS_KEY_SECRET", "")
	if accessKeyID == "" || accessKeySecret == "" {
		return stsCredentials{}, fmt.Errorf("Alibaba Cloud access key is not configured")
	}
	params := url.Values{"Action": {"AssumeRole"}, "Format": {"XML"}, "Version": {"2015-04-01"}, "AccessKeyId": {accessKeyID}, "SignatureMethod": {"HMAC-SHA1"}, "Timestamp": {time.Now().UTC().Format("2006-01-02T15:04:05Z")}, "SignatureVersion": {"1.0"}, "SignatureNonce": {uuid.NewString()}, "RoleArn": {getEnv("CREATIVE_SHOWCASE_OSS_ROLE_ARN", "")}, "RoleSessionName": {"creative-showcase"}, "DurationSeconds": {"900"}}
	params.Set("Signature", signSTS(params, accessKeySecret))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://sts.aliyuncs.com/?"+params.Encode(), nil)
	if err != nil {
		return stsCredentials{}, err
	}
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return stsCredentials{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return stsCredentials{}, fmt.Errorf("STS returned %s: %s", response.Status, strings.TrimSpace(string(body)))
	}
	var parsed assumeRoleResponse
	if err := xml.NewDecoder(response.Body).Decode(&parsed); err != nil {
		return stsCredentials{}, err
	}
	if parsed.Credentials.AccessKeyID == "" || parsed.Credentials.SecurityToken == "" {
		return stsCredentials{}, fmt.Errorf("STS response has no credentials")
	}
	return parsed.Credentials, nil
}

func signSTS(params url.Values, secret string) string {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, percentEncode(key)+"="+percentEncode(params.Get(key)))
	}
	stringToSign := "GET&%2F&" + percentEncode(strings.Join(parts, "&"))
	h := hmac.New(sha1.New, []byte(secret+"&"))
	_, _ = h.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}
func percentEncode(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(url.QueryEscape(value), "+", "%20"), "%7E", "~")
}
