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
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type legacyWorkspaceConversation struct {
	ID         int64 `gorm:"primaryKey"`
	UserID     int
	Title      string
	ActiveType string
}

func (legacyWorkspaceConversation) TableName() string {
	return "conversations"
}

func TestConversationUsesOpaquePublicID(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))

	first, err := CreateConversation(db, 10, KindText)
	require.NoError(t, err)
	second, err := CreateConversation(db, 10, KindText)
	require.NoError(t, err)
	_, err = uuid.Parse(first.PublicID)
	require.NoError(t, err)
	_, err = uuid.Parse(second.PublicID)
	require.NoError(t, err)
	assert.NotEqual(t, first.PublicID, second.PublicID)

	encoded, err := common.Marshal(first)
	require.NoError(t, err)
	var response map[string]any
	require.NoError(t, common.Unmarshal(encoded, &response))
	assert.Equal(t, first.PublicID, response["id"])
	assert.NotContains(t, response, "public_id")
}

func TestMigrateBackfillsOpaqueIDsForExistingConversations(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&legacyWorkspaceConversation{}))
	require.NoError(t, db.Create(&legacyWorkspaceConversation{UserID: 10, Title: "First", ActiveType: KindText}).Error)
	require.NoError(t, db.Create(&legacyWorkspaceConversation{UserID: 10, Title: "Second", ActiveType: KindText}).Error)

	require.NoError(t, Migrate(db))
	var conversations []Conversation
	require.NoError(t, db.Order("id asc").Find(&conversations).Error)
	require.Len(t, conversations, 2)
	assert.NotEmpty(t, conversations[0].PublicID)
	assert.NotEmpty(t, conversations[1].PublicID)
	assert.NotEqual(t, conversations[0].PublicID, conversations[1].PublicID)
	assert.True(t, db.Migrator().HasIndex(&Conversation{}, "idx_workspace_conversations_public_id"))
}

func TestConversationDraftsStayIsolatedByContentTypeAndUser(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))

	conversation, err := CreateConversation(db, 10, KindText)
	require.NoError(t, err)
	_, err = UpsertDraft(db, 10, conversation.PublicID, KindText, DraftInput{Model: "chat-model", Prompt: "hello"})
	require.NoError(t, err)
	_, err = UpsertDraft(db, 10, conversation.PublicID, KindImage, DraftInput{Model: "gpt-image-2", Prompt: "a lighthouse"})
	require.NoError(t, err)

	detail, err := GetConversation(db, 10, conversation.PublicID)
	require.NoError(t, err)
	require.Len(t, detail.Drafts, 2)
	assert.Equal(t, KindText, detail.Drafts[0].Type)
	assert.Equal(t, KindImage, detail.Drafts[1].Type)

	_, err = GetConversation(db, 11, conversation.PublicID)
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
	require.Len(t, VideoCapabilities, 2)
	assert.Equal(t, 12, VideoCapabilities[0].ReferenceLimit)
	assert.Equal(t, []Option{{Value: "first_last", Label: "First and last frame"}, {Value: "omni_reference", Label: "Omni reference"}}, VideoCapabilities[0].Modes)
	assert.False(t, VideoCapabilities[0].SupportsVideo)
}

func TestClaimRoundAllowsOnlyOneGeneration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, Migrate(db))
	conversation, err := CreateConversation(db, 10, KindImage)
	require.NoError(t, err)
	round, err := CreateRound(db, 10, conversation.PublicID, RoundInput{
		Type: KindImage, Model: "gpt-image-2", Prompt: "a lighthouse",
	})
	require.NoError(t, err)

	require.NoError(t, ClaimRound(db, 10, round.ID))
	tokenCount := 6840
	quota := 10951
	require.NoError(t, UpdateRound(db, 10, round.ID, map[string]any{
		"token_count": tokenCount,
		"quota":       quota,
	}))
	assert.Error(t, ClaimRound(db, 10, round.ID))
	claimed, err := GetRound(db, 10, round.ID)
	require.NoError(t, err)
	assert.Equal(t, RoundGenerating, claimed.Status)
	require.NotNil(t, claimed.TokenCount)
	require.NotNil(t, claimed.Quota)
	assert.Equal(t, tokenCount, *claimed.TokenCount)
	assert.Equal(t, quota, *claimed.Quota)
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
