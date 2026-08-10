/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package controller

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/custom/creative_showcase"
	workspaceData "github.com/QuantumNous/new-api/custom/workspace"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type workspaceCapabilitiesResponse struct {
	TextModels  []workspaceTextModelCapability  `json:"text_models"`
	ImageModels []workspaceData.ModelCapability `json:"image_models"`
	VideoModels []workspaceData.ModelCapability `json:"video_models"`
}

type workspaceTextModelCapability struct {
	Model  string   `json:"model"`
	Vendor string   `json:"vendor"`
	Groups []string `json:"groups"`
}

type workspaceConversationInput struct {
	Title      string `json:"title"`
	ActiveType string `json:"active_type"`
}

type workspaceTextResultInput struct {
	Text   string `json:"text"`
	Error  string `json:"error"`
	Failed bool   `json:"failed"`
}

type workspaceRelayEnvelope struct {
	RoundID  int64  `json:"round_id"`
	Kind     string `json:"kind"`
	Model    string `json:"model"`
	Prompt   string `json:"prompt"`
	N        *uint  `json:"n,omitempty"`
	Duration int    `json:"duration,omitempty"`
}

type workspacePresetResponse struct {
	Conversation workspaceData.Conversation `json:"conversation"`
	Draft        workspaceData.Draft        `json:"draft"`
}

const workspaceRoundContextKey = "workspace_round"

func GetWorkspaceCapabilities(c *gin.Context) {
	userID := c.GetInt("id")
	user, err := model.GetUserCache(userID)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	usableGroups := service.GetUserUsableGroups(user.Group)
	groups := make([]string, 0, len(usableGroups))
	for group := range usableGroups {
		if group != "auto" {
			groups = append(groups, group)
		}
	}
	sort.Strings(groups)
	modelGroups, err := model.GetEnabledModelGroups(groups)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	availableModels := make([]string, 0, len(modelGroups))
	for name := range modelGroups {
		availableModels = append(availableModels, name)
	}
	sort.Strings(availableModels)
	pricingVendors := workspacePricingVendorNames(model.GetPricing(), model.GetVendors())
	imageModels := filterWorkspaceCapabilities(workspaceData.ImageCapabilities, modelGroups, constant.EndpointTypeImageGeneration)
	videoModels := filterWorkspaceCapabilities(workspaceData.VideoCapabilities, modelGroups)
	for i := range imageModels {
		imageModels[i].Vendor = pricingVendors[imageModels[i].Model]
		if imageModels[i].Vendor == "" {
			imageModels[i].Vendor = "Custom"
		}
	}
	for i := range videoModels {
		videoModels[i].Vendor = pricingVendors[videoModels[i].Model]
		if videoModels[i].Vendor == "" {
			videoModels[i].Vendor = "Custom"
		}
	}
	reserved := make(map[string]bool, len(imageModels)+len(videoModels))
	for _, capability := range workspaceData.ImageCapabilities {
		reserved[capability.Model] = true
	}
	for _, capability := range workspaceData.VideoCapabilities {
		reserved[capability.Model] = true
	}
	textModels := make([]workspaceTextModelCapability, 0, len(availableModels))
	for _, name := range availableModels {
		if !reserved[name] && slices.Contains(model.GetModelSupportEndpointTypes(name), constant.EndpointTypeOpenAI) {
			vendor := pricingVendors[name]
			if vendor == "" {
				vendor = "Custom"
			}
			textModels = append(textModels, workspaceTextModelCapability{Model: name, Vendor: vendor, Groups: modelGroups[name]})
		}
	}
	common.ApiSuccess(c, workspaceCapabilitiesResponse{TextModels: textModels, ImageModels: imageModels, VideoModels: videoModels})
}

func workspacePricingVendorNames(pricing []model.Pricing, vendors []model.PricingVendor) map[string]string {
	vendorNames := make(map[int]string, len(vendors))
	for _, vendor := range vendors {
		if name := strings.TrimSpace(vendor.Name); name != "" {
			vendorNames[vendor.ID] = name
		}
	}

	result := make(map[string]string, len(pricing))
	for _, item := range pricing {
		if name := vendorNames[item.VendorID]; name != "" {
			result[item.ModelName] = name
		}
	}
	return result
}

func ListWorkspaceConversations(c *gin.Context) {
	page, pageSize := workspacePage(c)
	items, total, err := workspaceData.ListConversations(model.DB, c.GetInt("id"), c.Query("q"), pageSize, (page-1)*pageSize)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "page": page, "page_size": pageSize, "total": total, "has_more": int64(page*pageSize) < total})
}

func CreateWorkspaceConversation(c *gin.Context) {
	var input workspaceConversationInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid conversation data"))
		return
	}
	conversation, err := workspaceData.CreateConversation(model.DB, c.GetInt("id"), input.ActiveType)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	if strings.TrimSpace(input.Title) != "" {
		if err := workspaceData.UpdateConversation(model.DB, c.GetInt("id"), conversation.ID, input.Title, input.ActiveType); err != nil {
			workspaceFailure(c, http.StatusInternalServerError, err)
			return
		}
		conversation.Title = strings.TrimSpace(input.Title)
	}
	common.ApiSuccess(c, conversation)
}

func GetWorkspaceConversation(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	detail, err := workspaceData.GetConversation(model.DB, c.GetInt("id"), id)
	if err != nil {
		workspaceDataError(c, err)
		return
	}
	for index := range detail.Rounds {
		round := &detail.Rounds[index]
		if round.Type == workspaceData.KindVideo && round.Status == workspaceData.RoundGenerating && round.TaskID != "" {
			syncWorkspaceVideoRound(round)
		}
	}
	common.ApiSuccess(c, detail)
}

func UpdateWorkspaceConversation(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	var input workspaceConversationInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid conversation data"))
		return
	}
	if err := workspaceData.UpdateConversation(model.DB, c.GetInt("id"), id, input.Title, input.ActiveType); err != nil {
		workspaceDataError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id})
}

func DeleteWorkspaceConversation(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	if err := workspaceData.DeleteConversation(model.DB, c.GetInt("id"), id); err != nil {
		workspaceDataError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func SaveWorkspaceDraft(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	var input workspaceData.DraftInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid workspace draft"))
		return
	}
	draft, err := workspaceData.UpsertDraft(model.DB, c.GetInt("id"), id, c.Param("type"), input)
	if err != nil {
		workspaceDataError(c, err)
		return
	}
	common.ApiSuccess(c, draft)
}

func CreateWorkspaceRound(c *gin.Context) {
	conversationID, ok := workspaceID(c)
	if !ok {
		return
	}
	var input workspaceData.RoundInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid workspace round"))
		return
	}
	if err := validateWorkspaceRoundInput(c.GetInt("id"), input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, err)
		return
	}
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	if input.Group == "" || !service.GroupInUserUsableGroups(usingGroup, input.Group) && input.Group != usingGroup {
		workspaceFailure(c, http.StatusForbidden, errors.New("workspace group is not available"))
		return
	}
	groupModels, err := model.GetEnabledModelGroups([]string{input.Group})
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	if !slices.Contains(groupModels[input.Model], input.Group) {
		workspaceFailure(c, http.StatusBadRequest, errors.New("workspace model is not available in the selected group"))
		return
	}
	token, err := service.GetWorkspaceToken(c.GetInt("id"), input.Group, input.Model, c.ClientIP())
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	if token == nil {
		workspaceAPIKeyRequired(c, input.Model, input.Group)
		return
	}
	round, err := workspaceData.CreateRound(model.DB, c.GetInt("id"), conversationID, input)
	if err != nil {
		workspaceDataError(c, err)
		return
	}
	common.ApiSuccess(c, round)
}

func GetWorkspaceRound(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	round, err := workspaceData.GetRound(model.DB, c.GetInt("id"), id)
	if err != nil {
		workspaceDataError(c, err)
		return
	}
	if round.Type == workspaceData.KindVideo && round.Status == workspaceData.RoundGenerating && round.TaskID != "" {
		syncWorkspaceVideoRound(round)
	}
	common.ApiSuccess(c, round)
}

func SaveWorkspaceTextResult(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	var input workspaceTextResultInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid workspace text result"))
		return
	}
	round, err := workspaceData.GetRound(model.DB, c.GetInt("id"), id)
	if err != nil {
		workspaceDataError(c, err)
		return
	}
	if round.Type != workspaceData.KindText || round.Status != workspaceData.RoundGenerating {
		workspaceFailure(c, http.StatusConflict, errors.New("workspace round cannot accept a text result"))
		return
	}
	values := map[string]any{"status": workspaceData.RoundSucceeded, "text_result": input.Text, "error": ""}
	if input.Failed {
		values = map[string]any{"status": workspaceData.RoundFailed, "error": strings.TrimSpace(input.Error)}
	}
	if err := workspaceData.UpdateRound(model.DB, c.GetInt("id"), id, values); err != nil {
		workspaceDataError(c, err)
		return
	}
	if !input.Failed {
		autoNameWorkspaceConversation(round.ConversationID, c.GetInt("id"), round.Prompt)
	}
	common.ApiSuccess(c, gin.H{"id": id})
}

func ListWorkspaceAssets(c *gin.Context) {
	page, pageSize := workspacePage(c)
	items, total, err := workspaceData.ListAssets(model.DB, c.GetInt("id"), c.Query("kind"), c.Query("q"), pageSize, (page-1)*pageSize)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "page": page, "page_size": pageSize, "total": total, "has_more": int64(page*pageSize) < total})
}

func UploadWorkspaceAsset(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 500<<20)
	file, err := c.FormFile("file")
	if err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("workspace file is required"))
		return
	}
	asset, err := workspaceData.StoreLocalUpload(model.DB, c.GetInt("id"), file, c.PostForm("kind"))
	if err != nil {
		workspaceFailure(c, http.StatusBadRequest, err)
		return
	}
	common.ApiSuccess(c, asset)
}

func RegisterWorkspaceAsset(c *gin.Context) {
	var input workspaceData.RegisterAssetInput
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid workspace asset metadata"))
		return
	}
	asset, err := workspaceData.RegisterOSSAsset(model.DB, c.GetInt("id"), input)
	if err != nil {
		workspaceFailure(c, http.StatusBadRequest, err)
		return
	}
	common.ApiSuccess(c, asset)
}

func DeleteWorkspaceAsset(c *gin.Context) {
	id, ok := workspaceID(c)
	if !ok {
		return
	}
	if err := workspaceData.HideAsset(model.DB, c.GetInt("id"), id); err != nil {
		workspaceDataError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func GetWorkspaceUploadCredentials(c *gin.Context) {
	credentials, err := workspaceData.GetUploadCredentials(c.Request.Context(), c.GetInt("id"))
	if err != nil {
		workspaceData.LogStorageError("create upload credentials", err)
		workspaceFailure(c, http.StatusServiceUnavailable, errors.New("unable to create workspace upload credentials"))
		return
	}
	common.ApiSuccess(c, credentials)
}

func ServeWorkspaceAsset(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")
	path, ok := workspaceData.ResolveLocalAsset(key)
	if !ok {
		workspaceFailure(c, http.StatusNotFound, workspaceData.ErrNotFound)
		return
	}
	c.File(path)
}

func CreateWorkspacePreset(c *gin.Context) {
	caseID, err := strconv.ParseInt(c.Param("caseId"), 10, 64)
	if err != nil || caseID <= 0 {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid showcase case"))
		return
	}
	var item creative_showcase.Case
	if err := model.DB.Where("id = ? AND published = ?", caseID, true).First(&item).Error; err != nil {
		workspaceFailure(c, http.StatusNotFound, errors.New("showcase case not found"))
		return
	}
	conversation, err := workspaceData.CreateConversation(model.DB, c.GetInt("id"), item.Type)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	_ = workspaceData.UpdateConversation(model.DB, c.GetInt("id"), conversation.ID, item.Title, item.Type)
	settings := item.Settings
	if settings == "" {
		settingsBytes, marshalErr := common.Marshal(gin.H{"size": item.Size, "aspect_ratio": item.AspectRatio, "duration": item.Duration, "start_frame": item.StartFrame, "end_frame": item.EndFrame, "reference_urls": item.ReferenceURLs})
		if marshalErr != nil {
			workspaceFailure(c, http.StatusInternalServerError, marshalErr)
			return
		}
		settings = string(settingsBytes)
	}
	assetIDs := importWorkspaceCaseReferences(c.Request.Context(), c.GetInt("id"), item)
	assetIDsJSON, err := common.Marshal(assetIDs)
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	draft, err := workspaceData.UpsertDraft(model.DB, c.GetInt("id"), conversation.ID, item.Type, workspaceData.DraftInput{Model: item.Model, Group: item.Group, Prompt: item.Prompt, Settings: settings, AssetIDs: string(assetIDsJSON)})
	if err != nil {
		workspaceFailure(c, http.StatusInternalServerError, err)
		return
	}
	conversation.Title = item.Title
	common.ApiSuccess(c, workspacePresetResponse{Conversation: *conversation, Draft: *draft})
}

func importWorkspaceCaseReferences(ctx context.Context, userID int, item creative_showcase.Case) []int64 {
	references := make([]string, 0)
	if item.ReferenceURLs != "" {
		if err := common.UnmarshalJsonStr(item.ReferenceURLs, &references); err != nil {
			workspaceData.LogStorageError("parse showcase references", err)
		}
	}
	keys := []string{item.StartFrame, item.EndFrame}
	limit := workspaceReferenceLimit(item.Model)
	if limit <= 0 {
		if item.Type == workspaceData.KindImage {
			limit = 14
		} else {
			limit = 4
		}
	}
	assetIDs := make([]int64, 0, min(limit, len(references)+len(keys)))
	for _, key := range keys {
		if key == "" || len(assetIDs) >= limit {
			continue
		}
		if strings.HasPrefix(key, "http://") || strings.HasPrefix(key, "https://") {
			references = append(references, key)
			continue
		}
		data, mimeType, local, err := creative_showcase.ReadLocalAsset(key, 20<<20)
		if err != nil {
			workspaceData.LogStorageError("copy local showcase reference", err)
			continue
		}
		if local {
			asset, storeErr := workspaceData.StoreCaseAsset(model.DB, userID, "showcase-reference", mimeType, data)
			if storeErr != nil {
				workspaceData.LogStorageError("store showcase reference", storeErr)
				continue
			}
			assetIDs = append(assetIDs, asset.ID)
			continue
		}
		references = append(references, creative_showcase.PublicAssetURL(key))
	}
	for _, reference := range references {
		if len(assetIDs) >= limit || !strings.HasPrefix(reference, "http://") && !strings.HasPrefix(reference, "https://") {
			continue
		}
		asset, err := workspaceData.ArchiveRemoteAsset(ctx, model.DB, userID, workspaceData.KindImage, reference, "showcase-reference")
		if err != nil {
			workspaceData.LogStorageError("archive showcase reference", err)
			continue
		}
		asset.Origin = "case"
		_ = model.DB.Model(asset).Update("origin", asset.Origin).Error
		assetIDs = append(assetIDs, asset.ID)
	}
	return assetIDs
}

func PrepareWorkspaceGeneration() gin.HandlerFunc {
	return func(c *gin.Context) {
		roundID := c.GetInt64(middleware.WorkspaceRoundContextKey)
		userID := c.GetInt("id")
		round, err := workspaceData.GetRound(model.DB, userID, roundID)
		if err != nil {
			workspaceRelayError(c, http.StatusNotFound, err)
			c.Abort()
			return
		}
		if round.Status != workspaceData.RoundQueued {
			workspaceRelayError(c, http.StatusConflict, errors.New("workspace round is not queued"))
			c.Abort()
			return
		}
		usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
		if round.Group != "" {
			if !service.GroupInUserUsableGroups(usingGroup, round.Group) && round.Group != usingGroup {
				err = errors.New("workspace group is not available")
				failWorkspaceQueuedRound(userID, round.ID, err)
				workspaceRelayError(c, http.StatusForbidden, err)
				c.Abort()
				return
			}
			usingGroup = round.Group
			common.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)
			common.SetContextKey(c, constant.ContextKeyTokenGroup, usingGroup)
		}
		token, err := service.GetWorkspaceToken(userID, usingGroup, round.Model, c.ClientIP())
		if err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusInternalServerError, err)
			c.Abort()
			return
		}
		if token == nil {
			err = errors.New("a usable API key is required for the selected workspace group")
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceAPIKeyRequired(c, round.Model, usingGroup)
			c.Abort()
			return
		}
		if err := middleware.SetupContextForToken(c, token); err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusForbidden, err)
			c.Abort()
			return
		}
		assetIDs, err := parseWorkspaceAssetIDs(round.AssetIDs)
		if err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusBadRequest, err)
			c.Abort()
			return
		}
		assets, err := workspaceData.GetAssets(model.DB, userID, assetIDs)
		if err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusBadRequest, err)
			c.Abort()
			return
		}
		settings := map[string]any{}
		if round.Settings != "" {
			if err := common.UnmarshalJsonStr(round.Settings, &settings); err != nil {
				err = errors.New("workspace settings are invalid")
				failWorkspaceQueuedRound(userID, round.ID, err)
				workspaceRelayError(c, http.StatusBadRequest, err)
				c.Abort()
				return
			}
		}
		payload, path, err := canonicalWorkspacePayload(model.DB, round, assets, settings)
		if err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusBadRequest, err)
			c.Abort()
			return
		}
		encoded, err := common.Marshal(payload)
		if err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusInternalServerError, err)
			c.Abort()
			return
		}
		common.CleanupBodyStorage(c)
		storage, err := common.CreateBodyStorage(encoded)
		if err != nil {
			failWorkspaceQueuedRound(userID, round.ID, err)
			workspaceRelayError(c, http.StatusInternalServerError, err)
			c.Abort()
			return
		}
		c.Set(common.KeyBodyStorage, storage)
		c.Set(common.KeyRequestBody, encoded)
		c.Set(workspaceRoundContextKey, round)
		c.Request.Body = io.NopCloser(storage)
		c.Request.ContentLength = int64(len(encoded))
		c.Request.Header.Set("Content-Type", gin.MIMEJSON)
		c.Request.URL.Path = path
		c.Next()
		if c.Writer.Status() >= http.StatusBadRequest {
			failWorkspaceQueuedRound(userID, round.ID, errors.New("workspace generation could not start"))
		}
	}
}

func GenerateWorkspaceRound(c *gin.Context) {
	if c.GetBool("use_access_token") {
		workspaceRelayError(c, http.StatusForbidden, errors.New("workspace generation requires a user session"))
		return
	}
	roundID := c.GetInt64(middleware.WorkspaceRoundContextKey)
	userID := c.GetInt("id")
	roundValue, exists := c.Get(workspaceRoundContextKey)
	round, ok := roundValue.(*workspaceData.Round)
	if !exists || !ok {
		workspaceRelayError(c, http.StatusInternalServerError, errors.New("workspace round context is unavailable"))
		return
	}
	var envelope workspaceRelayEnvelope
	if err := common.UnmarshalBodyReusable(c, &envelope); err != nil {
		workspaceRelayError(c, http.StatusBadRequest, err)
		return
	}
	if round.Status != workspaceData.RoundQueued || envelope.Kind != round.Type || envelope.Model != round.Model || strings.TrimSpace(envelope.Prompt) != round.Prompt {
		workspaceRelayError(c, http.StatusConflict, errors.New("workspace generation request does not match its queued round"))
		return
	}
	if envelope.Kind == workspaceData.KindImage && (envelope.N == nil || *envelope.N != 1) {
		workspaceRelayError(c, http.StatusBadRequest, errors.New("workspace image generation count must be exactly one"))
		return
	}
	if err := validateWorkspaceDuration(envelope.Kind, envelope.Model, envelope.Duration); err != nil {
		workspaceRelayError(c, http.StatusBadRequest, err)
		return
	}
	if err := workspaceData.ClaimRound(model.DB, userID, roundID); err != nil {
		workspaceRelayError(c, http.StatusConflict, err)
		return
	}
	if envelope.Kind == workspaceData.KindText {
		writer := &workspaceStreamCaptureWriter{ResponseWriter: c.Writer}
		c.Writer = writer
		Relay(c, types.RelayFormatOpenAI)
		c.Writer = writer.ResponseWriter
		status := writer.ResponseWriter.Status()
		result, streamErr := workspaceTextFromStream(writer.body.Bytes())
		if status < http.StatusOK || status >= http.StatusMultipleChoices || streamErr != nil {
			message := responseMessage(writer.body.Bytes())
			if streamErr != nil {
				message = streamErr.Error()
			}
			_ = workspaceData.UpdateRound(model.DB, userID, roundID, map[string]any{"status": workspaceData.RoundFailed, "error": message})
			return
		}
		_ = workspaceData.UpdateRound(model.DB, userID, roundID, map[string]any{"status": workspaceData.RoundSucceeded, "text_result": result, "error": ""})
		autoNameWorkspaceConversation(round.ConversationID, userID, round.Prompt)
		return
	}
	writer := &workspaceCaptureWriter{ResponseWriter: c.Writer, status: http.StatusOK}
	c.Writer = writer
	if envelope.Kind == workspaceData.KindImage {
		Relay(c, types.RelayFormatOpenAIImage)
	} else {
		RelayTask(c)
	}
	c.Writer = writer.ResponseWriter
	writer.flush(c)
	if writer.status < http.StatusOK || writer.status >= http.StatusMultipleChoices {
		_ = workspaceData.UpdateRound(model.DB, userID, roundID, map[string]any{"status": workspaceData.RoundFailed, "error": responseMessage(writer.body.Bytes())})
		return
	}
	output := writer.body.String()
	values := map[string]any{"output": output}
	if envelope.Kind == workspaceData.KindImage {
		archivedOutput, archiveErr := workspaceData.ArchiveImageResponse(model.DB, userID, writer.body.Bytes())
		if archiveErr != nil {
			workspaceData.LogStorageError("archive generated image", archiveErr)
			values["status"] = workspaceData.RoundFailed
			values["error"] = "generated image could not be archived"
			_ = workspaceData.UpdateRound(model.DB, userID, roundID, values)
			return
		}
		values["output"] = archivedOutput
		values["status"] = workspaceData.RoundSucceeded
		autoNameWorkspaceConversation(round.ConversationID, userID, round.Prompt)
	} else if taskID := responseTaskID(writer.body.Bytes()); taskID != "" {
		values["task_id"] = taskID
	} else {
		values["status"] = workspaceData.RoundFailed
		values["error"] = "video provider did not return a task id"
	}
	_ = workspaceData.UpdateRound(model.DB, userID, roundID, values)
}

func canonicalWorkspacePayload(db *gorm.DB, round *workspaceData.Round, assets []workspaceData.Asset, settings map[string]any) (map[string]any, string, error) {
	payload := map[string]any{"round_id": round.ID, "kind": round.Type, "model": round.Model, "group": round.Group, "prompt": round.Prompt}
	images := make([]string, 0, len(assets))
	videoURL := ""
	for _, asset := range assets {
		if asset.Kind == workspaceData.KindImage {
			images = append(images, asset.PublicURL)
		} else if asset.Kind == workspaceData.KindVideo && videoURL == "" {
			videoURL = asset.PublicURL
		}
	}
	switch round.Type {
	case workspaceData.KindText:
		detail, err := workspaceData.GetConversation(db, round.UserID, round.ConversationID)
		if err != nil {
			return nil, "", err
		}
		messages := make([]map[string]string, 0, len(detail.Rounds)*2+1)
		for _, previous := range detail.Rounds {
			if previous.ID >= round.ID || previous.Type != workspaceData.KindText || previous.Status != workspaceData.RoundSucceeded {
				continue
			}
			messages = append(messages, map[string]string{"role": "user", "content": previous.Prompt}, map[string]string{"role": "assistant", "content": previous.TextResult})
		}
		messages = append(messages, map[string]string{"role": "user", "content": round.Prompt})
		payload["messages"] = messages
		payload["stream"] = true
		return payload, "/v1/chat/completions", nil
	case workspaceData.KindImage:
		payload["n"] = 1
		resolution := workspaceSettingString(settings, "resolution", "1K")
		aspectRatio := workspaceSettingString(settings, "aspectRatio", "1:1")
		capability := workspaceCapability(round.Model, workspaceData.ImageCapabilities)
		if capability == nil || !workspaceOptionAllowed(capability.Resolutions, resolution) || !workspaceOptionAllowed(capability.AspectRatios, aspectRatio) {
			return nil, "", errors.New("workspace image settings are not supported by the selected model")
		}
		if strings.HasPrefix(round.Model, "gpt-image-2") {
			payload["size"] = workspaceGPTImageSize(resolution, aspectRatio)
			quality := workspaceSettingString(settings, "quality", "medium")
			if !workspaceOptionAllowed(capability.Qualities, quality) {
				return nil, "", errors.New("workspace image quality is not supported by the selected model")
			}
			payload["quality"] = quality
		} else if strings.HasPrefix(round.Model, "gemini-") {
			payload["size"] = aspectRatio
			payload["quality"] = resolution
		} else {
			payload["size"] = resolution
			payload["extra_fields"] = map[string]any{"aspect_ratio": aspectRatio}
		}
		if len(images) == 1 {
			payload["image"] = images[0]
		} else if len(images) > 1 {
			payload["images"] = images
		}
		path := "/v1/images/generations"
		if len(images) > 0 {
			payload["operation"] = "edit"
			path = "/v1/images/edits"
		}
		return payload, path, nil
	case workspaceData.KindVideo:
		duration := workspaceSettingInt(settings, "duration", 5)
		if err := validateWorkspaceDuration(round.Type, round.Model, duration); err != nil {
			return nil, "", err
		}
		capability := workspaceCapability(round.Model, workspaceData.VideoCapabilities)
		aspectRatio := workspaceSettingString(settings, "aspectRatio", "16:9")
		if capability == nil || !workspaceOptionAllowed(capability.AspectRatios, aspectRatio) {
			return nil, "", errors.New("workspace video settings are not supported by the selected model")
		}
		payload["duration"] = duration
		payload["size"] = aspectRatio
		payload["images"] = images
		if len(images) > 0 {
			payload["image"] = images[0]
		}
		if videoURL != "" {
			payload["input_reference"] = videoURL
		}
		if round.Model == "doubao-seedance-2-0-260128" {
			mode := workspaceSettingString(settings, "mode", "omni_reference")
			resolution := workspaceSettingString(settings, "resolution", "720p")
			if !workspaceOptionAllowed(capability.Modes, mode) || !workspaceOptionAllowed(capability.Resolutions, resolution) {
				return nil, "", errors.New("workspace Seedance settings are invalid")
			}
			if mode == "video_edit" && videoURL == "" {
				return nil, "", errors.New("Seedance video editing requires a source video")
			}
			content := make([]map[string]any, 0, len(images)+1)
			if videoURL != "" {
				content = append(content, map[string]any{"type": "video_url", "video_url": map[string]string{"url": videoURL}})
			}
			for _, imageURL := range images {
				content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": imageURL}})
			}
			payload["metadata"] = map[string]any{"content": content, "resolution": resolution, "ratio": aspectRatio, "duration": duration, "generate_audio": workspaceSettingBool(settings, "audio")}
		} else {
			mode := workspaceSettingString(settings, "mode", "std")
			if !workspaceOptionAllowed(capability.Modes, mode) {
				return nil, "", errors.New("workspace Kling mode is invalid")
			}
			payload["mode"] = mode
			metadata := map[string]any{"mode": mode, "aspect_ratio": aspectRatio, "generate_audio": workspaceSettingBool(settings, "audio")}
			if len(images) > 1 {
				metadata["image_tail"] = images[1]
			}
			payload["metadata"] = metadata
		}
		return payload, "/v1/video/generations", nil
	default:
		return nil, "", errors.New("invalid workspace type")
	}
}

func workspaceCapability(modelName string, capabilities []workspaceData.ModelCapability) *workspaceData.ModelCapability {
	for index := range capabilities {
		if capabilities[index].Model == modelName {
			return &capabilities[index]
		}
	}
	return nil
}

func workspaceOptionAllowed(options []workspaceData.Option, value string) bool {
	for _, option := range options {
		if option.Value == value {
			return true
		}
	}
	return false
}

type workspaceCaptureWriter struct {
	gin.ResponseWriter
	body   bytes.Buffer
	status int
}

type workspaceStreamCaptureWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (writer *workspaceStreamCaptureWriter) Write(data []byte) (int, error) {
	if writer.body.Len() < 16<<20 {
		remaining := (16 << 20) - writer.body.Len()
		_, _ = writer.body.Write(data[:min(len(data), remaining)])
	}
	return writer.ResponseWriter.Write(data)
}

func (writer *workspaceStreamCaptureWriter) WriteString(data string) (int, error) {
	if writer.body.Len() < 16<<20 {
		remaining := (16 << 20) - writer.body.Len()
		_, _ = writer.body.WriteString(data[:min(len(data), remaining)])
	}
	return writer.ResponseWriter.WriteString(data)
}

func (writer *workspaceCaptureWriter) WriteHeader(code int) {
	writer.status = code
}

func (writer *workspaceCaptureWriter) WriteHeaderNow() {}

func (writer *workspaceCaptureWriter) Write(data []byte) (int, error) {
	return writer.body.Write(data)
}

func (writer *workspaceCaptureWriter) WriteString(data string) (int, error) {
	return writer.body.WriteString(data)
}

func (writer *workspaceCaptureWriter) Status() int {
	return writer.status
}

func (writer *workspaceCaptureWriter) Size() int {
	return writer.body.Len()
}

func (writer *workspaceCaptureWriter) Written() bool {
	return writer.body.Len() > 0
}

func (writer *workspaceCaptureWriter) flush(c *gin.Context) {
	writer.ResponseWriter.WriteHeader(writer.status)
	_, _ = writer.ResponseWriter.Write(writer.body.Bytes())
}

func filterWorkspaceCapabilities(items []workspaceData.ModelCapability, modelGroups map[string][]string, requiredEndpoint ...constant.EndpointType) []workspaceData.ModelCapability {
	filtered := make([]workspaceData.ModelCapability, 0, len(items))
	for _, item := range items {
		groups := modelGroups[item.Model]
		if len(groups) == 0 {
			continue
		}
		if len(requiredEndpoint) > 0 && !slices.Contains(model.GetModelSupportEndpointTypes(item.Model), requiredEndpoint[0]) {
			continue
		}
		item.Groups = groups
		filtered = append(filtered, item)
	}
	return filtered
}

func validateWorkspaceRoundInput(userID int, input workspaceData.RoundInput) error {
	if !workspaceData.IsKind(input.Type) || strings.TrimSpace(input.Model) == "" || strings.TrimSpace(input.Prompt) == "" {
		return errors.New("type, model and prompt are required")
	}
	if len(input.Prompt) > 100000 {
		return errors.New("workspace prompt is too long")
	}
	if input.Type == workspaceData.KindImage && workspaceReferenceLimit(input.Model) == 0 {
		return errors.New("workspace image model is not supported")
	}
	if input.Type == workspaceData.KindVideo && workspaceReferenceLimit(input.Model) == 0 {
		return errors.New("workspace video model is not supported")
	}
	var assetIDs []int64
	if input.AssetIDs != "" {
		if err := common.UnmarshalJsonStr(input.AssetIDs, &assetIDs); err != nil {
			return errors.New("invalid workspace asset list")
		}
	}
	assets, err := workspaceData.GetAssets(model.DB, userID, assetIDs)
	if err != nil {
		return err
	}
	imageCount := 0
	videoCount := 0
	for _, asset := range assets {
		if asset.Kind == workspaceData.KindImage {
			imageCount++
		} else if asset.Kind == workspaceData.KindVideo {
			videoCount++
		}
	}
	if input.Type == workspaceData.KindImage {
		if videoCount > 0 {
			return errors.New("image generation only accepts image references")
		}
		if imageCount > workspaceReferenceLimit(input.Model) {
			return errors.New("too many image references for the selected model")
		}
		return nil
	}
	if input.Type != workspaceData.KindVideo {
		return nil
	}
	settings := map[string]any{}
	if input.Settings != "" {
		if err := common.UnmarshalJsonStr(input.Settings, &settings); err != nil {
			return errors.New("workspace settings are invalid")
		}
	}
	duration := workspaceSettingInt(settings, "duration", 5)
	if err := validateWorkspaceDuration(input.Type, input.Model, duration); err != nil {
		return err
	}
	if input.Model == "kling-v3" {
		if videoCount > 0 || imageCount > 2 {
			return errors.New("Kling V3 accepts at most a first and last frame")
		}
		return nil
	}
	mode := workspaceSettingString(settings, "mode", "omni_reference")
	switch mode {
	case "first_last":
		if videoCount > 0 || imageCount > 2 {
			return errors.New("Seedance first and last frame mode accepts at most two images")
		}
	case "omni_reference":
		if videoCount > 0 || imageCount > 4 {
			return errors.New("Seedance omni reference mode accepts at most four images")
		}
	case "video_edit":
		if videoCount != 1 || imageCount > 4 {
			return errors.New("Seedance video editing requires one video and at most four images")
		}
	default:
		return errors.New("workspace Seedance mode is invalid")
	}
	return nil
}

func parseWorkspaceAssetIDs(encoded string) ([]int64, error) {
	if encoded == "" {
		return nil, nil
	}
	var ids []int64
	if err := common.UnmarshalJsonStr(encoded, &ids); err != nil {
		return nil, errors.New("workspace asset list is invalid")
	}
	return ids, nil
}

func workspaceSettingString(settings map[string]any, key, fallback string) string {
	if value, ok := settings[key].(string); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func workspaceSettingInt(settings map[string]any, key string, fallback int) int {
	switch value := settings[key].(type) {
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) || value < math.MinInt32 || value > math.MaxInt32 || math.Trunc(value) != value {
			return fallback
		}
		return int(value)
	case string:
		parsed, err := strconv.Atoi(value)
		if err == nil {
			return parsed
		}
	}
	return fallback
}

func workspaceSettingBool(settings map[string]any, key string) bool {
	value, _ := settings[key].(bool)
	return value
}

func workspaceGPTImageSize(resolution, aspectRatio string) string {
	sizes := map[string]map[string]string{
		"1K": {"1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536", "4:3": "1152x864", "3:4": "864x1152", "16:9": "1280x720", "9:16": "720x1280"},
		"2K": {"1:1": "2048x2048", "3:2": "2304x1536", "2:3": "1536x2304", "4:3": "2048x1536", "3:4": "1536x2048", "16:9": "2048x1152", "9:16": "1152x2048"},
		"4K": {"1:1": "2880x2880", "3:2": "3456x2304", "2:3": "2304x3456", "4:3": "3264x2448", "3:4": "2448x3264", "16:9": "3840x2160", "9:16": "2160x3840"},
	}
	if byRatio, ok := sizes[resolution]; ok {
		if size, ok := byRatio[aspectRatio]; ok {
			return size
		}
	}
	return "1024x1024"
}

func workspaceReferenceLimit(modelName string) int {
	for _, capability := range workspaceData.ImageCapabilities {
		if capability.Model == modelName {
			return capability.ReferenceLimit
		}
	}
	for _, capability := range workspaceData.VideoCapabilities {
		if capability.Model == modelName {
			return capability.ReferenceLimit
		}
	}
	return 0
}

func validateWorkspaceDuration(kind, modelName string, duration int) error {
	if kind != workspaceData.KindVideo {
		return nil
	}
	if modelName == "doubao-seedance-2-0-260128" && (duration < 4 || duration > 15) {
		return errors.New("Seedance duration must be between 4 and 15 seconds")
	}
	if modelName == "kling-v3" && (duration < 3 || duration > 15) {
		return errors.New("Kling V3 duration must be between 3 and 15 seconds")
	}
	return nil
}

func autoNameWorkspaceConversation(conversationID int64, userID int, prompt string) {
	var conversation workspaceData.Conversation
	if err := model.DB.Where("id = ? AND user_id = ?", conversationID, userID).First(&conversation).Error; err != nil || conversation.Title != "New conversation" {
		return
	}
	title := strings.TrimSpace(prompt)
	if len([]rune(title)) > 36 {
		title = string([]rune(title)[:36])
	}
	_ = workspaceData.UpdateConversation(model.DB, userID, conversationID, title, "")
}

func responseTaskID(data []byte) string {
	var response struct {
		ID     string `json:"id"`
		TaskID string `json:"task_id"`
		Data   struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	if err := common.Unmarshal(data, &response); err != nil {
		return ""
	}
	if response.TaskID != "" {
		return response.TaskID
	}
	if response.Data.TaskID != "" {
		return response.Data.TaskID
	}
	return response.ID
}

func responseMessage(data []byte) string {
	var response struct {
		Message string `json:"message"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := common.Unmarshal(data, &response); err != nil {
		return strings.TrimSpace(string(data))
	}
	if response.Error.Message != "" {
		return response.Error.Message
	}
	return response.Message
}

func workspaceTextFromStream(data []byte) (string, error) {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 64<<10), 16<<20)
	var result strings.Builder
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := common.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if chunk.Error.Message != "" {
			return "", errors.New(chunk.Error.Message)
		}
		if len(chunk.Choices) > 0 {
			result.WriteString(chunk.Choices[0].Delta.Content)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	if result.Len() == 0 {
		return "", errors.New("text provider returned no content")
	}
	return result.String(), nil
}

func syncWorkspaceVideoRound(round *workspaceData.Round) {
	task, exists, err := model.GetByTaskId(round.UserID, round.TaskID)
	if err != nil || !exists || task == nil {
		return
	}
	values := map[string]any{}
	switch task.Status {
	case model.TaskStatusSuccess:
		resultURL := task.GetResultURL()
		asset, archiveErr := workspaceData.ArchiveRemoteAsset(context.Background(), model.DB, round.UserID, workspaceData.KindVideo, resultURL, "generated-video")
		if archiveErr != nil {
			workspaceData.LogStorageError("archive generated video", archiveErr)
			round.Status = workspaceData.RoundFailed
			round.Error = "generated video could not be archived"
			values["status"] = round.Status
			values["error"] = round.Error
			break
		}
		resultURL = asset.PublicURL
		encoded, marshalErr := common.Marshal(gin.H{"url": resultURL, "task_id": round.TaskID})
		if marshalErr != nil {
			return
		}
		round.Status = workspaceData.RoundSucceeded
		round.Output = string(encoded)
		values["status"] = round.Status
		values["output"] = round.Output
		autoNameWorkspaceConversation(round.ConversationID, round.UserID, round.Prompt)
	case model.TaskStatusFailure:
		round.Status = workspaceData.RoundFailed
		round.Error = task.FailReason
		values["status"] = round.Status
		values["error"] = round.Error
	default:
		return
	}
	_ = workspaceData.UpdateRound(model.DB, round.UserID, round.ID, values)
}

func workspacePage(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 30
	}
	return page, pageSize
}

func workspaceID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		workspaceFailure(c, http.StatusBadRequest, errors.New("invalid workspace id"))
		return 0, false
	}
	return id, true
}

func workspaceDataError(c *gin.Context, err error) {
	if errors.Is(err, workspaceData.ErrNotFound) {
		workspaceFailure(c, http.StatusNotFound, err)
		return
	}
	workspaceFailure(c, http.StatusInternalServerError, err)
}

func workspaceFailure(c *gin.Context, status int, err error) {
	c.JSON(status, gin.H{"success": false, "message": err.Error()})
}

func workspaceAPIKeyRequired(c *gin.Context, modelName, group string) {
	c.JSON(http.StatusConflict, gin.H{
		"success": false,
		"code":    "workspace_api_key_required",
		"message": "A usable API key is required for the selected workspace group",
		"data": gin.H{
			"model":    modelName,
			"group":    group,
			"key_type": group,
		},
	})
}

func workspaceRelayError(c *gin.Context, status int, err error) {
	if status < 400 {
		status = http.StatusInternalServerError
	}
	c.JSON(status, gin.H{"error": gin.H{"message": err.Error(), "type": "workspace_error"}})
}

func failWorkspaceQueuedRound(userID int, roundID int64, err error) {
	if err == nil {
		return
	}
	_ = model.DB.Model(&workspaceData.Round{}).
		Where("id = ? AND user_id = ? AND status = ?", roundID, userID, workspaceData.RoundQueued).
		Updates(map[string]any{"status": workspaceData.RoundFailed, "error": err.Error()}).Error
}
