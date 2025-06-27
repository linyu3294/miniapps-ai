console.log("Example Mini App script loaded!"); 

class ShapeClassifier {
  constructor() {
    this.session = null;
    this.isModelLoaded = false;
    this.stream = null;
    this.shapeClasses = ['circle', 'square', 'triangle', 'octagon', 'hexagon', 'star'];
    
    this.initializeUI();
    this.loadModel();
  }

  async loadModel() {
    try {
      this.showMessage('Loading model...', 'loading');
      
      // Load the ONNX model
      this.session = await ort.InferenceSession.create('model.onnx');
      this.isModelLoaded = true;
      
      this.hideMessage('loading');
      this.showMessage('Model loaded successfully! Ready to classify shapes.', 'success');
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        this.hideMessage('success');
      }, 3000);
      
    } catch (error) {
      console.error('Error loading model:', error);
      this.showMessage(`Failed to load model: ${error.message}`, 'error');
    }
  }

  initializeUI() {
    // Camera controls
    document.getElementById('cameraBtn').addEventListener('click', () => this.startCamera());
    document.getElementById('stopCameraBtn').addEventListener('click', () => this.stopCamera());
    document.getElementById('captureBtn').addEventListener('click', () => this.capturePhoto());
    
    // File upload controls
    document.getElementById('fileBtn').addEventListener('click', () => this.showFileUpload());
    document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));
  }

  showFileUpload() {
    document.getElementById('cameraSection').classList.add('hidden');
    document.getElementById('fileSection').classList.remove('hidden');
    this.stopCamera();
  }

  async startCamera() {
    try {
      document.getElementById('fileSection').classList.add('hidden');
      document.getElementById('cameraSection').classList.remove('hidden');
      
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      const video = document.getElementById('videoPreview');
      video.srcObject = this.stream;
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      this.showMessage('Failed to access camera. Please check permissions.', 'error');
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    document.getElementById('cameraSection').classList.add('hidden');
  }

  capturePhoto() {
    const video = document.getElementById('videoPreview');
    const canvas = document.getElementById('canvasPreview');
    const context = canvas.getContext('2d');
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Show preview
    this.showPreview(canvas);
    
    // Classify the captured image
    this.classifyImage(canvas);
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showMessage('Please select a valid image file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.showPreview(img);
        this.classifyImage(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  showPreview(imageElement) {
    document.getElementById('previewSection').classList.remove('hidden');
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('canvasPreview').classList.add('hidden');
    
    if (imageElement.tagName === 'CANVAS') {
      document.getElementById('canvasPreview').classList.remove('hidden');
    } else {
      document.getElementById('imagePreview').src = imageElement.src;
      document.getElementById('imagePreview').classList.remove('hidden');
    }
  }

  async classifyImage(imageElement) {
    if (!this.isModelLoaded) {
      this.showMessage('Model is still loading. Please wait.', 'error');
      return;
    }

    try {
      this.showMessage('Processing image...', 'loading');
      this.hideResults();

      // Preprocess the image
      const tensor = await this.preprocessImage(imageElement);
      
      // Run inference
      const results = await this.runInference(tensor);
      
      // Display results
      this.displayResults(results);
      
      this.hideMessage('loading');
      
    } catch (error) {
      console.error('Error during classification:', error);
      this.showMessage(`Classification failed: ${error.message}`, 'error');
      this.hideMessage('loading');
    }
  }

  async preprocessImage(imageElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match model input (28x28 for your model)
    const inputSize = 28;
    canvas.width = inputSize;
    canvas.height = inputSize;
    
    // Draw and resize image
    ctx.drawImage(imageElement, 0, 0, inputSize, inputSize);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
    const data = imageData.data;
    
    // Convert to grayscale and normalize to 0-1
    const tensor = new Float32Array(inputSize * inputSize);
    
    for (let i = 0; i < inputSize * inputSize; i++) {
      // Convert RGB to grayscale using luminance formula
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Normalize to 0-1
      tensor[i] = gray / 255.0;
    }
    
    // Reshape to match model input format (1, 1, 28, 28) for grayscale
    return new ort.Tensor('float32', tensor, [1, 1, inputSize, inputSize]);
  }

  async runInference(tensor) {
    // Run the model
    const feeds = {};
    feeds[this.session.inputNames[0]] = tensor;
    
    const results = await this.session.run(feeds);
    
    // Get the output
    const output = results[this.session.outputNames[0]];
    const probabilities = Array.from(output.data);
    
    // Create results array with class names and probabilities
    const resultsArray = this.shapeClasses.map((className, index) => ({
      class: className,
      probability: probabilities[index]
    }));
    
    // Sort by probability (highest first)
    return resultsArray.sort((a, b) => b.probability - a.probability);
  }

  displayResults(results) {
    const resultsList = document.getElementById('resultsList');
    resultsList.innerHTML = '';
    
    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = 'result-item';
      
      const shapeName = document.createElement('span');
      shapeName.className = 'shape-name';
      shapeName.textContent = result.class.charAt(0).toUpperCase() + result.class.slice(1);
      
      const confidence = document.createElement('span');
      confidence.className = 'confidence';
      confidence.textContent = `${(result.probability * 100).toFixed(1)}%`;
      
      resultItem.appendChild(shapeName);
      resultItem.appendChild(confidence);
      resultsList.appendChild(resultItem);
    });
    
    document.getElementById('resultsSection').classList.remove('hidden');
  }

  hideResults() {
    document.getElementById('resultsSection').classList.add('hidden');
  }

  showMessage(message, type) {
    const element = document.getElementById(`${type}Section`);
    if (type === 'loading') {
      element.querySelector('div').textContent = message;
    } else {
      element.textContent = message;
    }
    element.classList.remove('hidden');
  }

  hideMessage(type) {
    document.getElementById(`${type}Section`).classList.add('hidden');
  }
}

window.startShapeApp = function() {
  new ShapeClassifier();
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.startShapeApp);
} else {
  window.startShapeApp();
}
// Note: Service worker registration is handled by the PWA shell 