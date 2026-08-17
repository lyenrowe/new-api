/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// Package workspace owns the persistent data used by the standalone creative
// workspace. It intentionally has no dependency on controllers or relay code.
package workspace

import (
	"errors"
	"slices"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	KindText  = "text"
	KindImage = "image"
	KindVideo = "video"

	RoundQueued     = "queued"
	RoundGenerating = "generating"
	RoundSucceeded  = "succeeded"
	RoundFailed     = "failed"
)

var ErrNotFound = errors.New("workspace record not found")

type Conversation struct {
	ID         int64     `json:"id" gorm:"primaryKey"`
	UserID     int       `json:"-" gorm:"index;not null"`
	Title      string    `json:"title" gorm:"size:200;not null"`
	ActiveType string    `json:"active_type" gorm:"size:16;not null"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" gorm:"index"`
}

type Draft struct {
	ID             int64     `json:"id" gorm:"primaryKey"`
	ConversationID int64     `json:"conversation_id" gorm:"uniqueIndex:idx_workspace_draft;not null"`
	Type           string    `json:"type" gorm:"size:16;uniqueIndex:idx_workspace_draft;not null"`
	Model          string    `json:"model" gorm:"size:160"`
	Group          string    `json:"group" gorm:"size:120"`
	Prompt         string    `json:"prompt" gorm:"type:text"`
	Settings       string    `json:"settings" gorm:"type:text"`
	AssetIDs       string    `json:"asset_ids" gorm:"type:text"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Round struct {
	ID             int64     `json:"id" gorm:"primaryKey"`
	ConversationID int64     `json:"conversation_id" gorm:"index;not null"`
	UserID         int       `json:"-" gorm:"index;not null"`
	Type           string    `json:"type" gorm:"size:16;index;not null"`
	Model          string    `json:"model" gorm:"size:160;not null"`
	Group          string    `json:"group" gorm:"size:120"`
	Prompt         string    `json:"prompt" gorm:"type:text;not null"`
	Settings       string    `json:"settings" gorm:"type:text"`
	AssetIDs       string    `json:"asset_ids" gorm:"type:text"`
	Status         string    `json:"status" gorm:"size:24;index;not null"`
	Error          string    `json:"error,omitempty" gorm:"type:text"`
	TextResult     string    `json:"text_result,omitempty" gorm:"type:text"`
	TaskID         string    `json:"task_id,omitempty" gorm:"size:191;index"`
	Output         string    `json:"output,omitempty" gorm:"type:text"`
	TokenCount     *int      `json:"token_count,omitempty"`
	Quota          *int      `json:"quota,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Asset struct {
	ID         int64     `json:"id" gorm:"primaryKey"`
	UserID     int       `json:"-" gorm:"index;not null"`
	Kind       string    `json:"kind" gorm:"size:16;index;not null"`
	Origin     string    `json:"origin" gorm:"size:24;index;not null"`
	Name       string    `json:"name" gorm:"size:255;not null"`
	StorageKey string    `json:"storage_key,omitempty" gorm:"type:text"`
	PublicURL  string    `json:"public_url" gorm:"type:text;not null"`
	MIMEType   string    `json:"mime_type" gorm:"size:120;not null"`
	Size       int64     `json:"size" gorm:"not null"`
	Hidden     bool      `json:"-" gorm:"index;not null"`
	CreatedAt  time.Time `json:"created_at" gorm:"index"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type ConversationDetail struct {
	Conversation Conversation `json:"conversation"`
	Drafts       []Draft      `json:"drafts"`
	Rounds       []Round      `json:"rounds"`
}

type DraftInput struct {
	Model    string `json:"model"`
	Group    string `json:"group"`
	Prompt   string `json:"prompt"`
	Settings string `json:"settings"`
	AssetIDs string `json:"asset_ids"`
}

type RoundInput struct {
	Type     string `json:"type"`
	Model    string `json:"model"`
	Group    string `json:"group"`
	Prompt   string `json:"prompt"`
	Settings string `json:"settings"`
	AssetIDs string `json:"asset_ids"`
}

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(&Conversation{}, &Draft{}, &Round{}, &Asset{})
}

func IsKind(value string) bool {
	return value == KindText || value == KindImage || value == KindVideo
}

func CreateConversation(db *gorm.DB, userID int, activeType string) (*Conversation, error) {
	if !IsKind(activeType) {
		activeType = KindText
	}
	conversation := &Conversation{UserID: userID, Title: "New conversation", ActiveType: activeType}
	if err := db.Create(conversation).Error; err != nil {
		return nil, err
	}
	return conversation, nil
}

func ListConversations(db *gorm.DB, userID int, query string, limit, offset int) ([]Conversation, int64, error) {
	statement := db.Model(&Conversation{}).Where("user_id = ?", userID)
	if value := strings.TrimSpace(query); value != "" {
		statement = statement.Where("title LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := statement.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var conversations []Conversation
	err := statement.Order("updated_at desc, id desc").Limit(limit).Offset(offset).Find(&conversations).Error
	return conversations, total, err
}

func GetConversation(db *gorm.DB, userID int, id int64) (*ConversationDetail, error) {
	var conversation Conversation
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&conversation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	var drafts []Draft
	if err := db.Where("conversation_id = ?", id).Order("id asc").Find(&drafts).Error; err != nil {
		return nil, err
	}
	var rounds []Round
	if err := db.Where("conversation_id = ? AND user_id = ?", id, userID).Order("id desc").Limit(100).Find(&rounds).Error; err != nil {
		return nil, err
	}
	slices.Reverse(rounds)
	return &ConversationDetail{Conversation: conversation, Drafts: drafts, Rounds: rounds}, nil
}

func UpdateConversation(db *gorm.DB, userID int, id int64, title, activeType string) error {
	updates := map[string]any{}
	if value := strings.TrimSpace(title); value != "" {
		runes := []rune(value)
		if len(runes) > 200 {
			value = string(runes[:200])
		}
		updates["title"] = value
	}
	if IsKind(activeType) {
		updates["active_type"] = activeType
	}
	if len(updates) == 0 {
		return nil
	}
	result := db.Model(&Conversation{}).Where("id = ? AND user_id = ?", id, userID).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func DeleteConversation(db *gorm.DB, userID int, id int64) error {
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND user_id = ?", id, userID).Delete(&Conversation{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrNotFound
		}
		if err := tx.Where("conversation_id = ?", id).Delete(&Draft{}).Error; err != nil {
			return err
		}
		return tx.Where("conversation_id = ? AND user_id = ?", id, userID).Delete(&Round{}).Error
	})
}

func UpsertDraft(db *gorm.DB, userID int, conversationID int64, kind string, input DraftInput) (*Draft, error) {
	if !IsKind(kind) {
		return nil, errors.New("invalid workspace type")
	}
	var count int64
	if err := db.Model(&Conversation{}).Where("id = ? AND user_id = ?", conversationID, userID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, ErrNotFound
	}
	var draft Draft
	err := db.Where("conversation_id = ? AND type = ?", conversationID, kind).First(&draft).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		draft = Draft{ConversationID: conversationID, Type: kind}
	} else if err != nil {
		return nil, err
	}
	draft.Model = strings.TrimSpace(input.Model)
	draft.Group = strings.TrimSpace(input.Group)
	draft.Prompt = input.Prompt
	draft.Settings = input.Settings
	draft.AssetIDs = input.AssetIDs
	if err := db.Save(&draft).Error; err != nil {
		return nil, err
	}
	_ = db.Model(&Conversation{}).Where("id = ? AND user_id = ?", conversationID, userID).Updates(map[string]any{"active_type": kind, "updated_at": time.Now()}).Error
	return &draft, nil
}

func CreateRound(db *gorm.DB, userID int, conversationID int64, input RoundInput) (*Round, error) {
	if !IsKind(input.Type) || strings.TrimSpace(input.Model) == "" || strings.TrimSpace(input.Prompt) == "" {
		return nil, errors.New("type, model and prompt are required")
	}
	var count int64
	if err := db.Model(&Conversation{}).Where("id = ? AND user_id = ?", conversationID, userID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, ErrNotFound
	}
	round := &Round{ConversationID: conversationID, UserID: userID, Type: input.Type, Model: strings.TrimSpace(input.Model), Group: strings.TrimSpace(input.Group), Prompt: strings.TrimSpace(input.Prompt), Settings: input.Settings, AssetIDs: input.AssetIDs, Status: RoundQueued}
	if err := db.Create(round).Error; err != nil {
		return nil, err
	}
	_ = db.Model(&Conversation{}).Where("id = ? AND user_id = ?", conversationID, userID).Updates(map[string]any{"active_type": input.Type, "updated_at": time.Now()}).Error
	return round, nil
}

func GetRound(db *gorm.DB, userID int, id int64) (*Round, error) {
	var round Round
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&round).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &round, nil
}

func UpdateRound(db *gorm.DB, userID int, id int64, values map[string]any) error {
	result := db.Model(&Round{}).Where("id = ? AND user_id = ?", id, userID).Updates(values)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ClaimRound atomically moves a queued round into generation. The conditional
// update prevents retries or parallel browser requests from billing twice.
func ClaimRound(db *gorm.DB, userID int, id int64) error {
	result := db.Model(&Round{}).
		Where("id = ? AND user_id = ? AND status = ?", id, userID, RoundQueued).
		Updates(map[string]any{"status": RoundGenerating, "error": ""})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("workspace round is already being processed")
	}
	return nil
}

func ListAssets(db *gorm.DB, userID int, kind, query string, limit, offset int) ([]Asset, int64, error) {
	statement := db.Model(&Asset{}).Where("user_id = ? AND hidden = ?", userID, false)
	if kind == KindImage || kind == KindVideo {
		statement = statement.Where("kind = ?", kind)
	}
	if value := strings.TrimSpace(query); value != "" {
		statement = statement.Where("name LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := statement.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var assets []Asset
	err := statement.Order("created_at desc, id desc").Limit(limit).Offset(offset).Find(&assets).Error
	return assets, total, err
}

func GetAssets(db *gorm.DB, userID int, ids []int64) ([]Asset, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var assets []Asset
	if err := db.Where("user_id = ? AND id IN ? AND hidden = ?", userID, ids, false).Find(&assets).Error; err != nil {
		return nil, err
	}
	if len(assets) != len(ids) {
		return nil, errors.New("one or more workspace assets are unavailable")
	}
	return assets, nil
}
