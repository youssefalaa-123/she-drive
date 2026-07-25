// Location search with autocomplete — web only
// Dropdown uses position:fixed (measured from real DOM div) so it never
// overlaps or pushes content down

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAutocompleteSuggestions } from '../utils/routing';
import { useTheme } from '../context/SettingsContext';

export default function LocationSearch({
  placeholder,
  value,        // { address, lat, lng } | null
  onChange,     // ({ address, lat, lng } | null) => void
  userLocation, // { lat, lng } | null
  dotColor,
  rightElement,
  style,
}) {
  const { colors, isDarkMode } = useTheme();
  dotColor = dotColor ?? colors.primary;
  const [text, setText]               = useState(value?.address || '');
  const [suggestions, setSuggestions] = useState([]);
  const [fetching, setFetching]       = useState(false);
  const [open, setOpen]               = useState(false);
  const [dropPos, setDropPos]         = useState(null);

  // ← real DOM div — getBoundingClientRect always works here
  const wrapperRef  = useRef(null);
  const debounceRef = useRef(null);
  const suppressRef = useRef(false);

  // Sync external value changes (e.g. "Use my location" button)
  const lastExternal = useRef(value?.address);
  if (value?.address !== lastExternal.current) {
    lastExternal.current = value?.address;
    setText(value?.address || '');
  }

  const measurePos = useCallback(() => {
    if (!wrapperRef.current) return;
    const r = wrapperRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  // Re-position when page scrolls/resizes while dropdown is open
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', measurePos, true);
    window.addEventListener('resize', measurePos);
    return () => {
      window.removeEventListener('scroll', measurePos, true);
      window.removeEventListener('resize', measurePos);
    };
  }, [open, measurePos]);

  const handleChange = useCallback((input) => {
    setText(input);
    onChange(null);
    clearTimeout(debounceRef.current);
    if (input.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      const results = await getAutocompleteSuggestions(
        input, userLocation?.lat, userLocation?.lng
      );
      setSuggestions(results);
      setFetching(false);
      if (results.length > 0) { measurePos(); setOpen(true); }
    }, 300);
  }, [onChange, userLocation, measurePos]);

  const handleSelect = useCallback((item) => {
    suppressRef.current = true;
    setOpen(false);
    setSuggestions([]);
    const place = { address: `${item.name}, ${item.secondary}`.replace(/, $/, ''), lat: item.lat, lng: item.lng };
    onChange(place);
    setText(place.address);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [onChange]);

  const handleBlur = () => {
    setTimeout(() => { if (!suppressRef.current) setOpen(false); }, 200);
  };

  const dropBg    = isDarkMode ? '#2C2C2E' : '#fff';
  const dropBorder = isDarkMode ? '#3A3A3C' : '#E5E7EB';
  const dropDivider= isDarkMode ? '#3A3A3C' : '#F3F4F6';
  const dropHover  = isDarkMode ? '#3A3A3C' : '#F9FAFB';
  const nameColor  = isDarkMode ? '#F2F2F7' : '#1F2937';
  const subColor   = isDarkMode ? '#A0A0A8' : '#6B7280';

  const styles = useMemo(() => StyleSheet.create({
    row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    dot:   { width: 10, height: 10, borderRadius: 5, marginEnd: 14, flexShrink: 0 },
    input: { flex: 1, fontSize: 15, color: colors.dark },
    icon:  { marginEnd: 4 },
  }), [colors.dark]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...(style || {}) }}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.gray}
          value={text}
          onChangeText={handleChange}
          onFocus={() => {
            if (text.trim().length >= 2 && suggestions.length > 0) {
              measurePos(); setOpen(true);
            }
          }}
          onBlur={handleBlur}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {fetching
          ? <ActivityIndicator size="small" color={colors.primary} style={styles.icon} />
          : value?.lat
            ? <Ionicons name="checkmark-circle" size={18} color={colors.success} style={styles.icon} />
            : null
        }
        {rightElement}
      </View>

      {/* Fixed dropdown — floats above all UI, scrollable, max 220px */}
      {open && suggestions.length > 0 && dropPos && (
        <div style={{
          position: 'fixed',
          top: dropPos.top,
          left: dropPos.left,
          width: dropPos.width,
          zIndex: 99999,
          backgroundColor: dropBg,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          border: `1px solid ${dropBorder}`,
          maxHeight: 220,
          overflowY: 'auto',
        }}>
          {suggestions.map((item, i) => (
            <div
              key={`${item.lat}-${item.lng}-${i}`}
              onMouseDown={() => handleSelect(item)}
              onMouseEnter={(e) => { e.currentTarget.style.background = dropHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = dropBg; }}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < suggestions.length - 1 ? `1px solid ${dropDivider}` : 'none',
                background: dropBg,
              }}
            >
              <span style={{ fontSize: 15, marginRight: 10, flexShrink: 0 }}>
                {item.isCurated ? '⭐' : '📍'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: nameColor,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.name}
                </div>
                {item.secondary ? (
                  <div style={{
                    fontSize: 12, color: subColor, marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {item.secondary}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
