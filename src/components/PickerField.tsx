import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/design';

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
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.options}>
        {options.length === 0 ? (
          <Text style={styles.empty}>{emptyLabel}</Text>
        ) : (
          options.map((option) => {
            const selected = option.value === value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.option, selected && styles.selectedOption]}
                onPress={() => onChange(option.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.optionText, selected && styles.selectedOptionText]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  selectedOption: {
    backgroundColor: '#EBF5FF',
    borderColor: Colors.blue,
  },
  optionText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  selectedOptionText: {
    color: Colors.blue,
  },
  empty: {
    color: Colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
});
