/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package workspace

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	assetPrefix      = "workspace/"
	maxImageFileSize = int64(20 << 20)
	maxVideoFileSize = int64(500 << 20)
)

type UploadCredentials struct {
	Mode            string `json:"mode"`
	AccessKeyID     string `json:"access_key_id,omitempty"`
	AccessKeySecret string `json:"access_key_secret,omitempty"`
	SecurityToken   string `json:"security_token,omitempty"`
	Expiration      string `json:"expiration,omitempty"`
	Bucket          string `json:"bucket,omitempty"`
	Region          string `json:"region,omitempty"`
	Prefix          string `json:"prefix"`
}

type RegisterAssetInput struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	StorageKey string `json:"storage_key"`
	MIMEType   string `json:"mime_type"`
	Size       int64  `json:"size"`
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

func GetUploadCredentials(ctx context.Context, userID int) (UploadCredentials, error) {
	prefix := userAssetPrefix(userID)
	if !OSSConfigured() {
		return UploadCredentials{Mode: "local", Prefix: prefix}, nil
	}
	credentials, err := assumeRole(ctx, userID)
	if err != nil {
		return UploadCredentials{}, err
	}
	return UploadCredentials{Mode: "oss", AccessKeyID: credentials.AccessKeyID, AccessKeySecret: credentials.AccessKeySecret, SecurityToken: credentials.SecurityToken, Expiration: credentials.Expiration, Bucket: env("WORKSPACE_OSS_BUCKET", ""), Region: env("WORKSPACE_OSS_REGION", ""), Prefix: prefix}, nil
}

func StoreLocalUpload(db *gorm.DB, userID int, header *multipart.FileHeader, kind string) (*Asset, error) {
	if OSSConfigured() {
		return nil, errors.New("local upload is disabled when workspace OSS is configured")
	}
	limit, err := fileLimit(kind)
	if err != nil {
		return nil, err
	}
	if header == nil || header.Size <= 0 || header.Size > limit {
		return nil, fmt.Errorf("file must be between 1 byte and %d bytes", limit)
	}
	file, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()

	sniff := make([]byte, 512)
	read, readErr := io.ReadFull(file, sniff)
	if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		return nil, readErr
	}
	sniff = sniff[:read]
	mimeType := http.DetectContentType(sniff)
	if !mimeMatchesKind(mimeType, kind) {
		return nil, errors.New("file content does not match the selected media type")
	}
	extension := normalizedExtension(header.Filename, mimeType)
	if extension == "" {
		return nil, errors.New("unsupported workspace file type")
	}
	key := userAssetPrefix(userID) + time.Now().UTC().Format("2006-01-02") + "/" + uuid.NewString() + extension
	path, ok := localAssetPath(key)
	if !ok {
		return nil, errors.New("invalid workspace storage key")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	destination, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return nil, err
	}
	_, copyErr := io.Copy(destination, io.MultiReader(bytes.NewReader(sniff), file))
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		if copyErr != nil {
			return nil, copyErr
		}
		return nil, closeErr
	}
	asset := &Asset{UserID: userID, Kind: kind, Origin: "upload", Name: strings.TrimSpace(header.Filename), StorageKey: key, PublicURL: PublicURL(key), MIMEType: mimeType, Size: header.Size}
	if err := db.Create(asset).Error; err != nil {
		_ = os.Remove(path)
		return nil, err
	}
	return asset, nil
}

func RegisterOSSAsset(db *gorm.DB, userID int, input RegisterAssetInput) (*Asset, error) {
	if !OSSConfigured() {
		return nil, errors.New("workspace OSS is not configured")
	}
	limit, err := fileLimit(input.Kind)
	if err != nil {
		return nil, err
	}
	if input.Size <= 0 || input.Size > limit || !mimeMatchesKind(input.MIMEType, input.Kind) {
		return nil, errors.New("invalid workspace asset metadata")
	}
	if !strings.HasPrefix(input.StorageKey, userAssetPrefix(userID)) || strings.Contains(input.StorageKey, "..") {
		return nil, errors.New("invalid workspace storage key")
	}
	actualSize, actualMIME, err := inspectOSSObject(context.Background(), userID, input.StorageKey)
	if err != nil {
		return nil, err
	}
	if actualSize <= 0 || actualSize > limit || actualSize != input.Size || !mimeMatchesKind(actualMIME, input.Kind) {
		return nil, errors.New("workspace OSS object does not match its metadata")
	}
	if normalizedExtension(input.Name, actualMIME) == "" || normalizedExtension(input.StorageKey, actualMIME) == "" {
		return nil, errors.New("workspace asset extension does not match its content")
	}
	asset := &Asset{UserID: userID, Kind: input.Kind, Origin: "upload", Name: strings.TrimSpace(input.Name), StorageKey: input.StorageKey, PublicURL: PublicURL(input.StorageKey), MIMEType: actualMIME, Size: actualSize}
	if asset.Name == "" {
		asset.Name = filepath.Base(input.StorageKey)
	}
	if err := db.Create(asset).Error; err != nil {
		return nil, err
	}
	return asset, nil
}

func ArchiveImageResponse(db *gorm.DB, userID int, responseBody []byte) (string, error) {
	var response struct {
		Created int64 `json:"created"`
		Data    []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return "", err
	}
	if len(response.Data) == 0 {
		return "", errors.New("image response has no output")
	}
	canonical := struct {
		Created int64 `json:"created"`
		Data    []struct {
			URL string `json:"url"`
		} `json:"data"`
	}{Created: response.Created, Data: make([]struct {
		URL string `json:"url"`
	}, 0, len(response.Data))}
	for index, item := range response.Data {
		var asset *Asset
		var err error
		if item.B64JSON != "" {
			asset, err = archiveBase64Image(db, userID, item.B64JSON, index)
		} else if item.URL != "" {
			asset, err = ArchiveRemoteAsset(context.Background(), db, userID, KindImage, item.URL, fmt.Sprintf("generated-image-%d", index+1))
		}
		if err != nil {
			return "", err
		}
		outputURL := item.URL
		if asset != nil {
			outputURL = asset.PublicURL
		}
		if outputURL == "" {
			return "", errors.New("image output cannot be archived")
		}
		canonical.Data = append(canonical.Data, struct {
			URL string `json:"url"`
		}{URL: outputURL})
	}
	encoded, err := common.Marshal(canonical)
	return string(encoded), err
}

func ArchiveRemoteAsset(ctx context.Context, db *gorm.DB, userID int, kind, remoteURL, name string) (*Asset, error) {
	if err := validatePublicRemoteURL(remoteURL); err != nil {
		return nil, err
	}
	client := &http.Client{
		Timeout:   2 * time.Minute,
		Transport: safeDownloadTransport(),
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many media redirects")
			}
			return validatePublicRemoteURL(request.URL.String())
		},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, remoteURL, nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("media download returned %s", response.Status)
	}
	limit, err := fileLimit(kind)
	if err != nil {
		return nil, err
	}
	limited := io.LimitReader(response.Body, limit+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("generated media exceeds workspace size limit")
	}
	mimeType := response.Header.Get("Content-Type")
	if separator := strings.IndexByte(mimeType, ';'); separator >= 0 {
		mimeType = mimeType[:separator]
	}
	if mimeType == "" || !mimeMatchesKind(mimeType, kind) {
		mimeType = http.DetectContentType(data)
	}
	if !mimeMatchesKind(mimeType, kind) {
		return nil, errors.New("generated media has an invalid content type")
	}
	return storeGeneratedBytes(db, userID, kind, name, mimeType, data)
}

func archiveBase64Image(db *gorm.DB, userID int, encoded string, index int) (*Asset, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, errors.New("generated image is not valid base64")
	}
	if int64(len(data)) > maxImageFileSize {
		return nil, errors.New("generated image exceeds workspace size limit")
	}
	mimeType := http.DetectContentType(data)
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, errors.New("generated image has an invalid content type")
	}
	return storeGeneratedBytes(db, userID, KindImage, fmt.Sprintf("generated-image-%d", index+1), mimeType, data)
}

func StoreCaseAsset(db *gorm.DB, userID int, name, mimeType string, data []byte) (*Asset, error) {
	kind := KindImage
	if strings.HasPrefix(mimeType, "video/") {
		kind = KindVideo
	}
	limit, err := fileLimit(kind)
	if err != nil || !mimeMatchesKind(mimeType, kind) || int64(len(data)) > limit {
		return nil, errors.New("showcase asset cannot be copied into the workspace")
	}
	asset, err := storeGeneratedBytes(db, userID, kind, name, mimeType, data)
	if err != nil {
		return nil, err
	}
	asset.Origin = "case"
	if err := db.Model(asset).Update("origin", asset.Origin).Error; err != nil {
		return nil, err
	}
	return asset, nil
}

func storeGeneratedBytes(db *gorm.DB, userID int, kind, name, mimeType string, data []byte) (*Asset, error) {
	extension := normalizedExtension(name, mimeType)
	if extension == "" {
		return nil, errors.New("generated media type is unsupported")
	}
	key := userAssetPrefix(userID) + time.Now().UTC().Format("2006-01-02") + "/" + uuid.NewString() + extension
	if OSSConfigured() {
		if err := putOSSObject(context.Background(), userID, key, mimeType, data); err != nil {
			return nil, err
		}
	} else {
		path, ok := localAssetPath(key)
		if !ok {
			return nil, errors.New("invalid workspace storage key")
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, data, 0644); err != nil {
			return nil, err
		}
	}
	asset := &Asset{UserID: userID, Kind: kind, Origin: "generated", Name: name, StorageKey: key, PublicURL: PublicURL(key), MIMEType: mimeType, Size: int64(len(data))}
	if err := db.Create(asset).Error; err != nil {
		if !OSSConfigured() {
			if path, ok := localAssetPath(key); ok {
				_ = os.Remove(path)
			}
		}
		return nil, err
	}
	return asset, nil
}

func putOSSObject(ctx context.Context, userID int, key, mimeType string, data []byte) error {
	credentials, err := assumeRole(ctx, userID)
	if err != nil {
		return err
	}
	bucket := env("WORKSPACE_OSS_BUCKET", "")
	region := env("WORKSPACE_OSS_REGION", "")
	endpoint := strings.TrimSuffix(env("WORKSPACE_OSS_ENDPOINT", fmt.Sprintf("https://%s.%s.aliyuncs.com", bucket, region)), "/")
	requestURL := endpoint + "/" + strings.TrimPrefix(key, "/")
	date := time.Now().UTC().Format(http.TimeFormat)
	canonicalResource := "/" + bucket + "/" + strings.TrimPrefix(key, "/")
	stringToSign := "PUT\n\n" + mimeType + "\n" + date + "\nx-oss-security-token:" + credentials.SecurityToken + "\n" + canonicalResource
	hash := hmac.New(sha1.New, []byte(credentials.AccessKeySecret))
	_, _ = hash.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(hash.Sum(nil))
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, requestURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", mimeType)
	request.Header.Set("Date", date)
	request.Header.Set("x-oss-security-token", credentials.SecurityToken)
	request.Header.Set("Authorization", "OSS "+credentials.AccessKeyID+":"+signature)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("OSS upload returned %s: %s", response.Status, strings.TrimSpace(string(body)))
	}
	return nil
}

func validatePublicRemoteURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return errors.New("generated media URL is invalid")
	}
	if strings.EqualFold(parsed.Hostname(), "localhost") {
		return errors.New("generated media URL points to a private host")
	}
	addresses, err := net.LookupIP(parsed.Hostname())
	if err != nil {
		return err
	}
	for _, address := range addresses {
		if address.IsLoopback() || address.IsPrivate() || address.IsUnspecified() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() {
			return errors.New("generated media URL points to a private address")
		}
	}
	return nil
}

func HideAsset(db *gorm.DB, userID int, id int64) error {
	result := db.Model(&Asset{}).Where("id = ? AND user_id = ?", id, userID).Update("hidden", true)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func PublicURL(key string) string {
	if OSSConfigured() {
		return strings.TrimSuffix(env("WORKSPACE_CDN_URL", ""), "/") + "/" + strings.TrimPrefix(key, "/")
	}
	return "/api/workspace/public/" + strings.TrimPrefix(key, "/")
}

func ResolveLocalAsset(key string) (string, bool) {
	if OSSConfigured() {
		return "", false
	}
	return localAssetPath(key)
}

func OSSConfigured() bool {
	return env("WORKSPACE_OSS_BUCKET", "") != "" && env("WORKSPACE_OSS_REGION", "") != "" && env("WORKSPACE_OSS_ROLE_ARN", "") != "" && env("WORKSPACE_CDN_URL", "") != ""
}

func fileLimit(kind string) (int64, error) {
	switch kind {
	case KindImage:
		return maxImageFileSize, nil
	case KindVideo:
		return maxVideoFileSize, nil
	default:
		return 0, errors.New("workspace assets must be images or videos")
	}
}

func mimeMatchesKind(mimeType, kind string) bool {
	return kind == KindImage && strings.HasPrefix(mimeType, "image/") || kind == KindVideo && strings.HasPrefix(mimeType, "video/")
}

func normalizedExtension(name, mimeType string) string {
	extension := strings.ToLower(filepath.Ext(name))
	allowed := map[string]map[string]bool{
		"image/png":       {".png": true},
		"image/jpeg":      {".jpg": true, ".jpeg": true},
		"image/webp":      {".webp": true},
		"image/gif":       {".gif": true},
		"video/mp4":       {".mp4": true},
		"video/webm":      {".webm": true},
		"video/quicktime": {".mov": true},
	}
	if extension != "" {
		if allowed[mimeType][extension] {
			return extension
		}
		return ""
	}
	switch mimeType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	default:
		return ""
	}
}

func inspectOSSObject(ctx context.Context, userID int, key string) (int64, string, error) {
	credentials, err := assumeRole(ctx, userID)
	if err != nil {
		return 0, "", err
	}
	bucket := env("WORKSPACE_OSS_BUCKET", "")
	region := env("WORKSPACE_OSS_REGION", "")
	endpoint := strings.TrimSuffix(env("WORKSPACE_OSS_ENDPOINT", fmt.Sprintf("https://%s.%s.aliyuncs.com", bucket, region)), "/")
	requestURL := endpoint + "/" + strings.TrimPrefix(key, "/")
	date := time.Now().UTC().Format(http.TimeFormat)
	canonicalResource := "/" + bucket + "/" + strings.TrimPrefix(key, "/")
	stringToSign := "GET\n\n\n" + date + "\nx-oss-security-token:" + credentials.SecurityToken + "\n" + canonicalResource
	hash := hmac.New(sha1.New, []byte(credentials.AccessKeySecret))
	_, _ = hash.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(hash.Sum(nil))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return 0, "", err
	}
	request.Header.Set("Date", date)
	request.Header.Set("Range", "bytes=0-511")
	request.Header.Set("x-oss-security-token", credentials.SecurityToken)
	request.Header.Set("Authorization", "OSS "+credentials.AccessKeyID+":"+signature)
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return 0, "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusPartialContent {
		return 0, "", fmt.Errorf("OSS inspection returned %s", response.Status)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 512))
	if err != nil {
		return 0, "", err
	}
	actualSize := response.ContentLength
	if contentRange := response.Header.Get("Content-Range"); contentRange != "" {
		if _, total, found := strings.Cut(contentRange, "/"); found {
			actualSize, _ = strconv.ParseInt(total, 10, 64)
		}
	}
	if actualSize <= 0 || len(data) == 0 {
		return 0, "", errors.New("OSS object has no content")
	}
	return actualSize, http.DetectContentType(data), nil
}

func safeDownloadTransport() http.RoundTripper {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		for _, resolved := range addresses {
			address := resolved.IP
			if address.IsLoopback() || address.IsPrivate() || address.IsUnspecified() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() {
				continue
			}
			return (&net.Dialer{Timeout: 15 * time.Second}).DialContext(ctx, network, net.JoinHostPort(address.String(), port))
		}
		return nil, errors.New("generated media URL resolves only to private addresses")
	}
	return transport
}

func userAssetPrefix(userID int) string {
	return assetPrefix + strconv.Itoa(userID) + "/"
}

func localAssetPath(key string) (string, bool) {
	cleaned := filepath.Clean(filepath.FromSlash(key))
	if !strings.HasPrefix(key, assetPrefix) || strings.Contains(key, "..") || strings.HasPrefix(cleaned, "..") {
		return "", false
	}
	return filepath.Join(env("WORKSPACE_LOCAL_DIR", "data"), cleaned), true
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func assumeRole(ctx context.Context, userID int) (stsCredentials, error) {
	accessKeyID := env("ALIYUN_ACCESS_KEY_ID", "")
	accessKeySecret := env("ALIYUN_ACCESS_KEY_SECRET", "")
	if accessKeyID == "" || accessKeySecret == "" {
		return stsCredentials{}, errors.New("Alibaba Cloud access key is not configured")
	}
	bucket := env("WORKSPACE_OSS_BUCKET", "")
	policy, err := common.Marshal(map[string]any{
		"Version": "1",
		"Statement": []map[string]any{{
			"Effect":   "Allow",
			"Action":   []string{"oss:PutObject", "oss:GetObject"},
			"Resource": []string{"acs:oss:*:*:" + bucket + "/" + userAssetPrefix(userID) + "*"},
		}},
	})
	if err != nil {
		return stsCredentials{}, err
	}
	params := url.Values{"Action": {"AssumeRole"}, "Format": {"XML"}, "Version": {"2015-04-01"}, "AccessKeyId": {accessKeyID}, "SignatureMethod": {"HMAC-SHA1"}, "Timestamp": {time.Now().UTC().Format("2006-01-02T15:04:05Z")}, "SignatureVersion": {"1.0"}, "SignatureNonce": {uuid.NewString()}, "RoleArn": {env("WORKSPACE_OSS_ROLE_ARN", "")}, "RoleSessionName": {fmt.Sprintf("workspace-%d", userID)}, "DurationSeconds": {"900"}, "Policy": {string(policy)}}
	params.Set("Signature", signSTS(params, accessKeySecret))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://sts.aliyuncs.com/?"+params.Encode(), nil)
	if err != nil {
		return stsCredentials{}, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return stsCredentials{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return stsCredentials{}, fmt.Errorf("STS returned %s", response.Status)
	}
	var parsed assumeRoleResponse
	if err := xml.NewDecoder(response.Body).Decode(&parsed); err != nil {
		return stsCredentials{}, err
	}
	if parsed.Credentials.AccessKeyID == "" || parsed.Credentials.SecurityToken == "" {
		return stsCredentials{}, errors.New("STS response has no credentials")
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
	hash := hmac.New(sha1.New, []byte(secret+"&"))
	_, _ = hash.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(hash.Sum(nil))
}

func percentEncode(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(url.QueryEscape(value), "+", "%20"), "%7E", "~")
}

func LogStorageError(message string, err error) {
	common.SysError(fmt.Sprintf("workspace: %s: %v", message, err))
}
