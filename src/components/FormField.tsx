import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/design';

type FormFieldProps = TextInputProps & {
  label: string;
};

export function FormField({ label, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput 
        placeholderTextColor={Colors.textMuted} 
        style={styles.input} 
        {...inputProps} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
    marginBottom: Spacing.xs,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  input: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    color: Colors.textPrimary,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    fontWeight: '600',
  },
});
