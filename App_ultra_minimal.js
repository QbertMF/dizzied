import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ULTRA MINIMAL - NO 3D LIBRARIES AT ALL
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hello React Native!</Text>
      <Text style={styles.subtext}>This is a basic app with no 3D libraries</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#87CEEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});