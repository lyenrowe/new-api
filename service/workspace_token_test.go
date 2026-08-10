/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package service

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetWorkspaceTokenSelectsNewestEligibleExactGroupKey(t *testing.T) {
	originalDB := model.DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = originalDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	now := common.GetTimestamp()
	allowedIP := "10.0.0.0/8"
	otherIP := "192.168.0.0/16"
	tokens := []model.Token{
		{Id: 1, UserId: 7, Key: "valid-old", Status: common.TokenStatusEnabled, Group: "default", UnlimitedQuota: true, ExpiredTime: -1},
		{Id: 2, UserId: 7, Key: "disabled", Status: common.TokenStatusDisabled, Group: "default", UnlimitedQuota: true, ExpiredTime: -1},
		{Id: 3, UserId: 7, Key: "exhausted", Status: common.TokenStatusEnabled, Group: "default", RemainQuota: 0, ExpiredTime: -1},
		{Id: 4, UserId: 7, Key: "expired", Status: common.TokenStatusEnabled, Group: "default", UnlimitedQuota: true, ExpiredTime: now - 1},
		{Id: 5, UserId: 7, Key: "limited", Status: common.TokenStatusEnabled, Group: "default", UnlimitedQuota: true, ExpiredTime: -1, ModelLimitsEnabled: true, ModelLimits: "other-model"},
		{Id: 6, UserId: 7, Key: "wrong-ip", Status: common.TokenStatusEnabled, Group: "default", UnlimitedQuota: true, ExpiredTime: -1, AllowIps: &otherIP},
		{Id: 7, UserId: 7, Key: "auto", Status: common.TokenStatusEnabled, Group: "auto", UnlimitedQuota: true, ExpiredTime: -1},
		{Id: 8, UserId: 8, Key: "other-user", Status: common.TokenStatusEnabled, Group: "default", UnlimitedQuota: true, ExpiredTime: -1},
		{Id: 9, UserId: 7, Key: "valid-new", Status: common.TokenStatusEnabled, Group: "default", UnlimitedQuota: true, ExpiredTime: -1, ModelLimitsEnabled: true, ModelLimits: "target-model", AllowIps: &allowedIP},
	}
	require.NoError(t, db.Create(&tokens).Error)

	token, err := GetWorkspaceToken(7, "default", "target-model", "10.1.2.3")
	require.NoError(t, err)
	require.NotNil(t, token)
	assert.Equal(t, 9, token.Id)

	token, err = GetWorkspaceToken(7, "default", "target-model", "172.16.0.1")
	require.NoError(t, err)
	require.NotNil(t, token)
	assert.Equal(t, 1, token.Id)

	token, err = GetWorkspaceToken(7, "vip", "target-model", "10.1.2.3")
	require.NoError(t, err)
	assert.Nil(t, token)
}
