# Shape Classifier PWA

A Progressive Web App that uses ONNX.js to classify geometric shapes in real-time using your camera or uploaded images.

## Features

- 📷 **Camera Input**: Capture photos directly from your device camera
- 📁 **File Upload**: Upload images from your device
- 🤖 **AI Classification**: Uses ONNX.js for local inference (no server required)
- 📱 **PWA Support**: Installable as a native app
- 🔄 **Offline Capable**: Works without internet connection
- 🎨 **Modern UI**: Beautiful, responsive design

## Supported Shapes

The app can classify the following geometric shapes:
- Circle
- Square
- Triangle
- Octagon
- Hexagon
- Star

## How to Use

1. **Camera Mode**:
   - Click "📷 Use Camera" to access your device camera
   - Point the camera at a shape
   - Click "📸 Capture Photo" to take a picture
   - View the classification results

2. **File Upload Mode**:
   - Click "📁 Upload Image" to select an image file
   - Choose an image containing shapes
   - View the classification results

## Technical Details

### Model Requirements
- Input size: 28x28 pixels
- Format: Grayscale (1 channel)
- Normalization: 0-1 range
- Output: 6-class probabilities

### Browser Compatibility
- Chrome/Edge (recommended for best ONNX.js performance)
- Firefox
- Safari (iOS 14+)

### PWA Features
- Service Worker for offline caching
- Web App Manifest for native app installation
- Responsive design for all screen sizes

## File Structure

```
example-mini-app-1/
├── index.html          # Main app interface
├── app.js             # Application logic and ONNX inference
├── manifest.json      # PWA manifest
├── sw.js             # Service worker for offline support
├── icon.png          # App icon
├── model.onnx        # Trained ONNX model
└── README.md         # This file
```

## Deployment

This app is designed to work with the miniapps-ai platform architecture:

1. **Upload Process**: The app bundle is uploaded through the platform interface
2. **S3 Storage**: Assets are stored in S3 under `/apps/shape/`
3. **PWA Shell**: The app is loaded dynamically by the PWA shell
4. **CloudFront**: Served via CloudFront with URL rewriting

## Development

To test locally:

1. Serve the files using a local web server:
   ```bash
   python -m http.server 8000
   # or
   npx serve .
   ```

2. Open `http://localhost:8000` in your browser

3. For PWA testing, use HTTPS (required for camera access and service worker)

## Model Training Notes

The ONNX model should be trained to:
- Accept 28x28 grayscale images
- Output 6-class probabilities
- Use standard image preprocessing (normalization to 0-1)

## Troubleshooting

- **Camera not working**: Ensure HTTPS is used and camera permissions are granted
- **Model loading fails**: Check that `model.onnx` is accessible and valid
- **Offline not working**: Verify service worker is registered and caching properly
- **Performance issues**: Use Chrome/Edge for best ONNX.js performance 