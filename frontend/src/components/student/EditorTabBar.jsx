import React, { useState, useRef } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";

/**
 * EditorTabBar
 *
 * Props:
 *  - files:    { id: number, name: string, content: string }[]
 *  - activeId: number
 *  - onSelect(id): called when a tab is clicked
 *  - onAdd():      called when "+" is clicked
 *  - onClose(id):  called when "×" is clicked on a tab
 *  - onRename(id, newName): called when an inline rename is committed
 */
export default function EditorTabBar({ files, activeId, onSelect, onAdd, onClose, onRename }) {
  // id of the tab currently being renamed, or null
  const [editingId, setEditingId] = useState(null);
  // draft value while renaming
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef(null);

  const handleTabChange = (_event, newId) => {
    if (editingId !== null) return; // ignore tab-switch while renaming
    onSelect(newId);
  };

  const handleDoubleClick = (event, file) => {
    event.stopPropagation();
    setEditingId(file.id);
    setDraftName(file.name);
    // Focus the input on the next tick (after render)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
  };

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed.length > 0 && editingId !== null) {
      const current = files.find((f) => f.id === editingId);
      if (current && trimmed !== current.name) {
        onRename(editingId, trimmed);
      }
    }
    setEditingId(null);
    setDraftName("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      commitRename();
    } else if (event.key === "Escape") {
      setEditingId(null);
      setDraftName("");
    }
  };

  const handleClose = (event, id) => {
    event.stopPropagation();
    onClose(id);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        minHeight: 40,
        px: 0.5,
      }}
    >
      <Tabs
        value={activeId}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          flex: 1,
          minHeight: 40,
          "& .MuiTabs-indicator": { height: 2 },
        }}
      >
        {files.map((file) => (
          <Tab
            key={file.id}
            value={file.id}
            disableRipple={editingId === file.id}
            sx={{
              minHeight: 40,
              px: 1,
              py: 0,
              textTransform: "none",
              fontSize: 13,
              "&.Mui-selected": { fontWeight: 600 },
            }}
            label={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  // prevent Tab's own click from firing onDoubleClick twice
                }}
                onDoubleClick={(e) => handleDoubleClick(e, file)}
              >
                {editingId === file.id ? (
                  <TextField
                    inputRef={inputRef}
                    value={draftName}
                    size="small"
                    variant="standard"
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={handleKeyDown}
                    // Prevent the tab switch when clicking inside the input
                    onClick={(e) => e.stopPropagation()}
                    inputProps={{
                      style: { fontSize: 13, padding: "1px 0", width: Math.max(draftName.length * 8, 60) },
                    }}
                    sx={{ "& .MuiInput-underline:before": { borderBottomColor: "primary.main" } }}
                  />
                ) : (
                  <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </span>
                )}

                {files.length > 1 && (
                  <Tooltip title="Close" placement="top" arrow>
                    <IconButton
                      component="span"
                      size="small"
                      onClick={(e) => handleClose(e, file.id)}
                      sx={{
                        p: 0.25,
                        ml: 0.25,
                        opacity: 0.6,
                        "&:hover": { opacity: 1, color: "error.main" },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            }
          />
        ))}
      </Tabs>

      <Tooltip title="New file" placement="top" arrow>
        <IconButton
          size="small"
          onClick={onAdd}
          sx={{
            ml: 0.5,
            flexShrink: 0,
            color: "text.secondary",
            "&:hover": { color: "primary.main" },
          }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
