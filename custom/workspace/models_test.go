/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package workspace

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestConversationDraftsStayIsolatedByContentTypeAndUser(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))

	conversation, err := CreateConversation(db, 10, KindText)
	require.NoError(t, err)
	_, err = UpsertDraft(db, 10, conversation.ID, KindText, DraftInput{Model: "chat-model", Prompt: "hello"})
	require.NoError(t, err)
	_, err = UpsertDraft(db, 10, conversation.ID, KindImage, DraftInput{Model: "gpt-image-2", Prompt: "a lighthouse"})
	require.NoError(t, err)

	detail, err := GetConversation(db, 10, conversation.ID)
	require.NoError(t, err)
	require.Len(t, detail.Drafts, 2)
	assert.Equal(t, KindText, detail.Drafts[0].Type)
	assert.Equal(t, KindImage, detail.Drafts[1].Type)

	_, err = GetConversation(db, 11, conversation.ID)
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestWorkspaceCapabilityAliasesRemainExact(t *testing.T) {
	imageModels := make([]string, 0, len(ImageCapabilities))
	for _, capability := range ImageCapabilities {
		imageModels = append(imageModels, capability.Model)
	}
	videoModels := make([]string, 0, len(VideoCapabilities))
	for _, capability := range VideoCapabilities {
		videoModels = append(videoModels, capability.Model)
	}
	assert.Equal(t, []string{"gpt-image-2", "gpt-image-2-sp", "gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview", "ByteDance-Seedream-5.0"}, imageModels)
	assert.Equal(t, []string{"doubao-seedance-2-0-260128", "kling-v3"}, videoModels)
}

func TestClaimRoundAllowsOnlyOneGeneration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))
	conversation, err := CreateConversation(db, 10, KindImage)
	require.NoError(t, err)
	round, err := CreateRound(db, 10, conversation.ID, RoundInput{
		Type: KindImage, Model: "gpt-image-2", Prompt: "a lighthouse",
	})
	require.NoError(t, err)

	require.NoError(t, ClaimRound(db, 10, round.ID))
	assert.Error(t, ClaimRound(db, 10, round.ID))
	claimed, err := GetRound(db, 10, round.ID)
	require.NoError(t, err)
	assert.Equal(t, RoundGenerating, claimed.Status)
}

func TestArchiveImageResponseStoresGeneratedOutputInUserWorkspace(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))
	t.Setenv("WORKSPACE_LOCAL_DIR", t.TempDir())
	t.Setenv("WORKSPACE_OSS_BUCKET", "")
	pngHeader := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	encoded := base64.StdEncoding.EncodeToString(pngHeader)
	response, err := common.Marshal(map[string]any{"created": 1, "data": []map[string]string{{"b64_json": encoded}}})
	require.NoError(t, err)

	canonical, err := ArchiveImageResponse(db, 42, response)
	require.NoError(t, err)
	var output struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	require.NoError(t, common.UnmarshalJsonStr(canonical, &output))
	require.Len(t, output.Data, 1)
	assert.Contains(t, output.Data[0].URL, "/api/workspace/public/workspace/42/")

	var asset Asset
	require.NoError(t, db.Where("user_id = ?", 42).First(&asset).Error)
	assert.Equal(t, "generated", asset.Origin)
	_, err = os.Stat(filepath.Join(env("WORKSPACE_LOCAL_DIR", "data"), filepath.FromSlash(asset.StorageKey)))
	require.NoError(t, err)
}

func TestWorkspaceAssetValidationRejectsMismatchedExtensionsAndPrivateURLs(t *testing.T) {
	assert.Empty(t, normalizedExtension("reference.mp4", "image/png"))
	assert.Equal(t, ".png", normalizedExtension("reference.png", "image/png"))
	assert.Error(t, validatePublicRemoteURL("http://127.0.0.1/private.png"))
	assert.Error(t, validatePublicRemoteURL("file:///etc/passwd"))
}
