import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Let the player pick a photo, crop it square and shrink it to a small JPEG.
 * Returns the JPEG bytes, or null if they cancelled.
 */
export async function pickProfilePhoto(): Promise<ArrayBuffer | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  // 512 px is plenty for avatars and keeps uploads around 50 KB.
  const context = ImageManipulator.manipulate(result.assets[0].uri);
  context.resize({ width: 512, height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  const response = await fetch(saved.uri);
  return response.arrayBuffer();
}
