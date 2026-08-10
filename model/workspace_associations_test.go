/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkspaceModelAssociationsAndVendors(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Model{}, &Vendor{}))
	const modelName = "workspace-association-model"
	channelIDs := []int{98001, 98002, 98003, 98004}
	t.Cleanup(func() {
		DB.Where("channel_id IN ?", channelIDs).Delete(&Ability{})
		DB.Where("model_name = ?", modelName).Delete(&Model{})
		DB.Where("name = ?", "Workspace Vendor").Delete(&Vendor{})
	})

	vendor := Vendor{Name: "Workspace Vendor", Status: 1}
	require.NoError(t, vendor.Insert())
	require.NoError(t, DB.Create(&Model{ModelName: modelName, VendorID: vendor.Id, Status: 1}).Error)
	priority := int64(0)
	require.NoError(t, DB.Create(&[]Ability{
		{Group: "default", Model: modelName, ChannelId: channelIDs[0], Enabled: true, Priority: &priority},
		{Group: "vip", Model: modelName, ChannelId: channelIDs[1], Enabled: true, Priority: &priority},
		{Group: "hidden", Model: modelName, ChannelId: channelIDs[2], Enabled: true, Priority: &priority},
		{Group: "disabled", Model: modelName, ChannelId: channelIDs[3], Enabled: false, Priority: &priority},
	}).Error)

	groups, err := GetEnabledModelGroups([]string{"vip", "default", "disabled"})
	require.NoError(t, err)
	assert.Equal(t, []string{"default", "vip"}, groups[modelName])

	vendors, err := GetModelVendorNames([]string{modelName, "missing"})
	require.NoError(t, err)
	assert.Equal(t, "Workspace Vendor", vendors[modelName])
	assert.NotContains(t, vendors, "missing")
}
