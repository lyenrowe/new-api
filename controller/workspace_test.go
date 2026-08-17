/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	workspaceData "github.com/QuantumNous/new-api/custom/workspace"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestWorkspaceConversationIDRejectsSequentialNumericID(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Params = gin.Params{{Key: "id", Value: "1"}}

	id, ok := workspaceConversationID(context)

	assert.False(t, ok)
	assert.Empty(t, id)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestWorkspaceConversationIDAcceptsUUID(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Params = gin.Params{{Key: "id", Value: "7A7D8D8D-C9A0-4C2D-BFD4-FDB4F6C415D8"}}

	id, ok := workspaceConversationID(context)

	assert.True(t, ok)
	assert.Equal(t, "7a7d8d8d-c9a0-4c2d-bfd4-fdb4f6c415d8", id)
}

func TestWorkspaceCanonicalPayloadKeepsImageCountAndKlingFalseAudio(t *testing.T) {
	imageRound := &workspaceData.Round{ID: 1, UserID: 10, Type: workspaceData.KindImage, Model: "gpt-image-2", Prompt: "poster"}
	imagePayload, imagePath, err := canonicalWorkspacePayload(nil, imageRound, nil, map[string]any{
		"resolution": "4K", "aspectRatio": "16:9", "quality": "high",
	})
	require.NoError(t, err)
	assert.Equal(t, "/v1/images/generations", imagePath)
	assert.Equal(t, 1, imagePayload["n"])
	assert.Equal(t, "3840x2160", imagePayload["size"])

	videoRound := &workspaceData.Round{ID: 2, UserID: 10, Type: workspaceData.KindVideo, Model: "kling-v3", Prompt: "orbit"}
	videoPayload, videoPath, err := canonicalWorkspacePayload(nil, videoRound, nil, map[string]any{
		"duration": float64(15), "aspectRatio": "9:16", "mode": "pro", "audio": false,
	})
	require.NoError(t, err)
	assert.Equal(t, "/v1/video/generations", videoPath)
	assert.Equal(t, 15, videoPayload["duration"])
	metadata, ok := videoPayload["metadata"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, false, metadata["generate_audio"])
}

func TestWorkspaceVideoPayloadDefaultsAudioAndKeepsKlingFrameOrder(t *testing.T) {
	seedanceRound := &workspaceData.Round{ID: 3, UserID: 10, Type: workspaceData.KindVideo, Model: "doubao-seedance-2-0-260128", Prompt: "orbit"}
	seedancePayload, _, err := canonicalWorkspacePayload(nil, seedanceRound, nil, map[string]any{})
	require.NoError(t, err)
	seedanceMetadata, ok := seedancePayload["metadata"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, true, seedanceMetadata["generate_audio"])
	assert.Empty(t, seedanceMetadata["content"])

	klingRound := &workspaceData.Round{ID: 4, UserID: 10, Type: workspaceData.KindVideo, Model: "kling-v3", Prompt: "orbit"}
	assets := []workspaceData.Asset{
		{Kind: workspaceData.KindImage, PublicURL: "https://example.com/first.png"},
		{Kind: workspaceData.KindImage, PublicURL: "https://example.com/last.png"},
	}
	klingPayload, _, err := canonicalWorkspacePayload(nil, klingRound, assets, map[string]any{"audio": false})
	require.NoError(t, err)
	assert.Equal(t, "https://example.com/first.png", klingPayload["image"])
	klingMetadata, ok := klingPayload["metadata"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "https://example.com/last.png", klingMetadata["image_tail"])
	assert.Equal(t, false, klingMetadata["generate_audio"])
}

func TestWorkspaceSeedanceReferenceValidationAllowsTwelveImages(t *testing.T) {
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, workspaceData.Migrate(db))
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	assetIDs := make([]int64, 0, 13)
	for index := 0; index < 13; index++ {
		asset := workspaceData.Asset{
			UserID:    10,
			Kind:      workspaceData.KindImage,
			Origin:    "upload",
			Name:      fmt.Sprintf("reference-%d.png", index),
			PublicURL: fmt.Sprintf("https://example.com/reference-%d.png", index),
			MIMEType:  "image/png",
			Size:      100,
		}
		require.NoError(t, db.Create(&asset).Error)
		assetIDs = append(assetIDs, asset.ID)
	}

	settings, err := common.Marshal(map[string]any{"mode": "omni_reference", "duration": 5})
	require.NoError(t, err)
	encodeIDs := func(ids []int64) string {
		encoded, marshalErr := common.Marshal(ids)
		require.NoError(t, marshalErr)
		return string(encoded)
	}
	input := workspaceData.RoundInput{
		Type:     workspaceData.KindVideo,
		Model:    "doubao-seedance-2-0-260128",
		Prompt:   "orbit",
		Settings: string(settings),
		AssetIDs: encodeIDs(assetIDs[:12]),
	}
	require.NoError(t, validateWorkspaceRoundInput(10, input))

	input.AssetIDs = encodeIDs(assetIDs)
	assert.EqualError(t, validateWorkspaceRoundInput(10, input), "Seedance omni reference mode accepts at most twelve images")

	legacySettings, err := common.Marshal(map[string]any{"mode": "video_edit", "duration": 5})
	require.NoError(t, err)
	input.Settings = string(legacySettings)
	input.AssetIDs = ""
	assert.EqualError(t, validateWorkspaceRoundInput(10, input), "workspace Seedance mode is invalid")
}

func TestWorkspaceTextStreamExtraction(t *testing.T) {
	result, err := workspaceTextFromStream([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"hello \"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"world\"}}]}\n\ndata: [DONE]\n\n"))
	require.NoError(t, err)
	assert.Equal(t, "hello world", result)
}

func TestWorkspaceCanonicalTextPayloadIgnoresLegacyTuningSettings(t *testing.T) {
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&workspaceData.Conversation{}, &workspaceData.Draft{}, &workspaceData.Round{}))
	conversation := workspaceData.Conversation{UserID: 10, Title: "text", ActiveType: workspaceData.KindText}
	require.NoError(t, db.Create(&conversation).Error)
	round := &workspaceData.Round{ID: 2, ConversationID: conversation.ID, UserID: 10, Type: workspaceData.KindText, Model: "text-model", Prompt: "hello"}

	payload, path, err := canonicalWorkspacePayload(db, round, nil, map[string]any{
		"temperature": 2.0,
		"maxTokens":   1024.0,
	})
	require.NoError(t, err)
	assert.Equal(t, "/v1/chat/completions", path)
	assert.NotContains(t, payload, "temperature")
	assert.NotContains(t, payload, "max_tokens")
}

func TestWorkspaceAPIKeyRequiredResponseHasStableContract(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)

	workspaceAPIKeyRequired(context, "target-model", "vip")

	assert.Equal(t, http.StatusConflict, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
		Data    struct {
			Model   string `json:"model"`
			Group   string `json:"group"`
			KeyType string `json:"key_type"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Equal(t, "workspace_api_key_required", response.Code)
	assert.Equal(t, "target-model", response.Data.Model)
	assert.Equal(t, "vip", response.Data.Group)
	assert.Equal(t, "vip", response.Data.KeyType)
}

func TestWorkspacePricingVendorNamesMatchesPricingCatalogAssociations(t *testing.T) {
	pricing := []model.Pricing{
		{ModelName: "catalog-model", VendorID: 2},
		{ModelName: "unassigned-model"},
		{ModelName: "unknown-vendor-model", VendorID: 99},
	}
	vendors := []model.PricingVendor{
		{ID: 1, Name: "Other Vendor"},
		{ID: 2, Name: "Catalog Vendor"},
	}

	assert.Equal(t, map[string]string{
		"catalog-model": "Catalog Vendor",
	}, workspacePricingVendorNames(pricing, vendors))
}
