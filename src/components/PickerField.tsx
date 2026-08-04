import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '../constants/design';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type PickerOption = {
  label: string;
  value: string;
};

type PickerFieldProps = {
  label: string;
  options: PickerOption[];
  value: string | null;
  onChange: (value: string) => void;
  emptyLabel: string;
};

export function PickerField({ label, options, value, onChange, emptyLabel }: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const pick = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      {/* Trigger button */}
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.triggerText, !selectedOption && styles.triggerPlaceholder]}
          numberOfLines={1}
        >
          {selectedOption?.label ?? emptyLabel}
        </Text>
        <ChevronDown size={18} color={Colors.textMuted} strokeWidth={2} />
      </TouchableOpacity>

      {/* Bottom-sheet modal */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TouchableOpacity onPress={close} hitSlop={12}>
              <X size={22} color={Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Search bar (only show when there are enough items) */}
          {options.length > 4 && (
            <View style={styles.searchRow}>
              <Search size={16} color={Colors.textMuted} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search…"
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Options list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>No results found</Text>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <TouchableOpacity
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={() => pick(item.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.optionText, selected && styles.optionTextSelected]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                  {selected && (
                    <Check size={18} color={Colors.blue} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Trigger ────────────────────────────────
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    height: 48,
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  triggerText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  triggerPlaceholder: {
    color: Colors.textMuted,
  },

  // ── Modal ──────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 13, 26, 0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },

  // ── Search ─────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    marginHorizontal: Spacing.lg,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },

  // ── Options ────────────────────────────────
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    gap: 12,
  },
  optionRowSelected: {
    backgroundColor: '#EBF5FF',
  },
  optionText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: Colors.blue,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
