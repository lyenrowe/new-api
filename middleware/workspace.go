/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const (
	WorkspaceKindContextKey  = "workspace_kind"
	WorkspaceRoundContextKey = "workspace_round_id"
)

type workspaceRelayRequest struct {
	RoundID   int64  `json:"round_id"`
	Kind      string `json:"kind"`
	Group     string `json:"group"`
	Operation string `json:"operation"`
}

// PrepareWorkspaceRelay turns the standalone workspace request into a path
// understood by the shared distributor without changing Playground behavior.
func PrepareWorkspaceRelay() gin.HandlerFunc {
	return func(c *gin.Context) {
		var request workspaceRelayRequest
		if err := common.UnmarshalBodyReusable(c, &request); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid workspace generation request"})
			return
		}
		if request.RoundID <= 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": "Workspace round is required"})
			return
		}
		path, err := workspaceRelayPath(request.Kind, request.Operation)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.Set(WorkspaceKindContextKey, request.Kind)
		c.Set(WorkspaceRoundContextKey, request.RoundID)
		c.Request.URL.Path = path
		c.Next()
	}
}

func workspaceRelayPath(kind, operation string) (string, error) {
	switch strings.TrimSpace(kind) {
	case "text":
		return "/v1/chat/completions", nil
	case "image":
		if operation == "edit" {
			return "/v1/images/edits", nil
		}
		return "/v1/images/generations", nil
	case "video":
		return "/v1/video/generations", nil
	default:
		return "", errors.New("workspace type must be text, image or video")
	}
}
