import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type ScreenStateProps = {
  message?: string;
  loading?: boolean;
};

export function ScreenState({ message, loading = false }: ScreenStateProps) {
  return (
    <View style={styles.wrapper}>
      {loading && <ActivityIndicator color="#0084FF" />}
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: '#4a627a',
    marginTop: 10,
    textAlign: 'center',
  },
});
