import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  isBusy?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', disabled, isBusy, style }: ButtonProps) {
  const theme = useTheme();
  const background =
    variant === 'primary' ? theme.tint : variant === 'danger' ? 'transparent' : theme.backgroundElement;
  const color = variant === 'primary' ? theme.onTint : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || isBusy, busy: isBusy }}
      disabled={disabled || isBusy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background },
        (pressed || disabled || isBusy) && styles.dimmed,
        style,
      ]}>
      {isBusy ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText style={[styles.buttonText, { color }]}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; suffix?: string; error?: string | null };

export function Field({ label, suffix, error, style, ...inputProps }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={[styles.inputRow, { backgroundColor: theme.backgroundElement }]}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }, style]}
          {...inputProps}
        />
        {suffix && <ThemedText themeColor="textSecondary">{suffix}</ThemedText>}
      </View>
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
    </View>
  );
}

type ChipProps = { label: string; isSelected: boolean; onPress: () => void };

export function Chip({ label, isSelected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}>
      <ThemedView type={isSelected ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
        <ThemedText type="small" themeColor={isSelected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function ChipRow({ children }: PropsWithChildren) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

type RowProps = { title: string; subtitle?: string | null; trailing?: ReactNode; onPress?: () => void };

export function ListRow({ title, subtitle, trailing, onPress }: RowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.dimmed]}>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={2}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: 600,
  },
  dimmed: {
    opacity: 0.6,
  },
  field: {
    gap: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: Spacing.three,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
