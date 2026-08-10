/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package service

import (
	"net"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// GetWorkspaceToken selects the newest API key that can serve the exact group
// and model from the current client IP. Auto-group keys intentionally do not
// cover concrete workspace groups.
func GetWorkspaceToken(userID int, group, modelName, clientIP string) (*model.Token, error) {
	tokens, err := model.GetEnabledUserTokensByGroup(userID, group)
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	matchedModel := ratio_setting.FormatMatchingModelName(modelName)
	for _, token := range tokens {
		if token.ExpiredTime != -1 && token.ExpiredTime < now {
			continue
		}
		if !token.UnlimitedQuota && token.RemainQuota <= 0 {
			continue
		}
		if token.ModelLimitsEnabled {
			if _, ok := token.GetModelLimitsMap()[matchedModel]; !ok {
				continue
			}
		}
		allowIPs := token.GetIpLimits()
		if len(allowIPs) > 0 {
			ip := net.ParseIP(clientIP)
			if ip == nil || !common.IsIpInCIDRList(ip, allowIPs) {
				continue
			}
		}
		return token, nil
	}
	return nil, nil
}
