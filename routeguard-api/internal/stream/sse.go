package stream

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// Writer wraps http.ResponseWriter for Server-Sent Events.
type Writer struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

// NewWriter prepares w for SSE streaming and returns a Writer.
// Returns (nil, false) if w does not support flushing.
func NewWriter(w http.ResponseWriter) (*Writer, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable Nginx/Traefik buffering
	return &Writer{w: w, flusher: flusher}, true
}

// Send writes an SSE event with the given type and JSON-serialized data.
func (s *Writer) Send(event string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, b)
	s.flusher.Flush()
	return nil
}
