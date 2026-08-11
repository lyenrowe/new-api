/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package workspace

import "strconv"

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type ModelCapability struct {
	Model           string   `json:"model"`
	Vendor          string   `json:"vendor"`
	Type            string   `json:"type"`
	Groups          []string `json:"groups,omitempty" gorm:"-"`
	ReferenceLimit  int      `json:"reference_limit,omitempty"`
	Resolutions     []Option `json:"resolutions,omitempty"`
	AspectRatios    []Option `json:"aspect_ratios,omitempty"`
	Qualities       []Option `json:"qualities,omitempty"`
	Modes           []Option `json:"modes,omitempty"`
	Durations       []Option `json:"durations,omitempty"`
	SupportsAudio   bool     `json:"supports_audio,omitempty"`
	SupportsFrames  bool     `json:"supports_frames,omitempty"`
	SupportsVideo   bool     `json:"supports_video,omitempty"`
	SupportsEditing bool     `json:"supports_editing,omitempty"`
}

var commonImageRatios = []Option{
	{Value: "1:1", Label: "1:1"}, {Value: "3:2", Label: "3:2"}, {Value: "2:3", Label: "2:3"},
	{Value: "4:3", Label: "4:3"}, {Value: "3:4", Label: "3:4"}, {Value: "16:9", Label: "16:9"}, {Value: "9:16", Label: "9:16"},
}

var standardResolutions = []Option{{Value: "1K", Label: "1K"}, {Value: "2K", Label: "2K"}, {Value: "4K", Label: "4K"}}

var ImageCapabilities = []ModelCapability{
	{Model: "gpt-image-2", Vendor: "OpenAI", Type: KindImage, ReferenceLimit: 16, Resolutions: standardResolutions, AspectRatios: commonImageRatios, Qualities: []Option{{Value: "low", Label: "Low"}, {Value: "medium", Label: "Medium"}, {Value: "high", Label: "High"}}, SupportsEditing: true},
	{Model: "gpt-image-2-sp", Vendor: "OpenAI", Type: KindImage, ReferenceLimit: 16, Resolutions: standardResolutions, AspectRatios: commonImageRatios, Qualities: []Option{{Value: "low", Label: "Low"}, {Value: "medium", Label: "Medium"}, {Value: "high", Label: "High"}}, SupportsEditing: true},
	{Model: "gemini-3-pro-image-preview", Vendor: "Google", Type: KindImage, ReferenceLimit: 14, Resolutions: standardResolutions, AspectRatios: []Option{{Value: "1:1", Label: "1:1"}, {Value: "2:3", Label: "2:3"}, {Value: "3:2", Label: "3:2"}, {Value: "3:4", Label: "3:4"}, {Value: "4:3", Label: "4:3"}, {Value: "4:5", Label: "4:5"}, {Value: "5:4", Label: "5:4"}, {Value: "9:16", Label: "9:16"}, {Value: "16:9", Label: "16:9"}, {Value: "21:9", Label: "21:9"}}, SupportsEditing: true},
	{Model: "gemini-3.1-flash-image-preview", Vendor: "Google", Type: KindImage, ReferenceLimit: 14, Resolutions: standardResolutions, AspectRatios: []Option{{Value: "1:1", Label: "1:1"}, {Value: "1:4", Label: "1:4"}, {Value: "1:8", Label: "1:8"}, {Value: "2:3", Label: "2:3"}, {Value: "3:2", Label: "3:2"}, {Value: "3:4", Label: "3:4"}, {Value: "4:1", Label: "4:1"}, {Value: "4:3", Label: "4:3"}, {Value: "4:5", Label: "4:5"}, {Value: "5:4", Label: "5:4"}, {Value: "8:1", Label: "8:1"}, {Value: "9:16", Label: "9:16"}, {Value: "16:9", Label: "16:9"}, {Value: "21:9", Label: "21:9"}}, SupportsEditing: true},
	{Model: "ByteDance-Seedream-5.0", Vendor: "ByteDance", Type: KindImage, ReferenceLimit: 10, Resolutions: standardResolutions, AspectRatios: commonImageRatios, SupportsEditing: true},
}

var VideoCapabilities = []ModelCapability{
	{Model: "doubao-seedance-2-0-260128", Vendor: "ByteDance", Type: KindVideo, ReferenceLimit: 12, Resolutions: []Option{{Value: "480p", Label: "480p"}, {Value: "720p", Label: "720p"}, {Value: "1080p", Label: "1080p"}}, AspectRatios: []Option{{Value: "16:9", Label: "16:9"}, {Value: "9:16", Label: "9:16"}, {Value: "1:1", Label: "1:1"}, {Value: "4:3", Label: "4:3"}, {Value: "3:4", Label: "3:4"}}, Modes: []Option{{Value: "first_last", Label: "First and last frame"}, {Value: "omni_reference", Label: "Omni reference"}}, Durations: durationOptions(4, 15), SupportsAudio: true, SupportsFrames: true},
	{Model: "kling-v3", Vendor: "Kling", Type: KindVideo, ReferenceLimit: 2, AspectRatios: []Option{{Value: "16:9", Label: "16:9"}, {Value: "9:16", Label: "9:16"}, {Value: "1:1", Label: "1:1"}}, Modes: []Option{{Value: "std", Label: "Standard"}, {Value: "pro", Label: "Professional"}}, Durations: durationOptions(3, 15), SupportsAudio: true, SupportsFrames: true},
}

func durationOptions(start, end int) []Option {
	options := make([]Option, 0, end-start+1)
	for seconds := start; seconds <= end; seconds++ {
		label := durationLabel(seconds)
		options = append(options, Option{Value: label, Label: label + "s"})
	}
	return options
}

func durationLabel(value int) string {
	return strconv.Itoa(value)
}
