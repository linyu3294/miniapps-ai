# -*- coding: utf-8 -*-
"""
Memory-Efficient High-Resolution Shape Classifier
Uses smart upscaling and fewer samples to avoid memory crashes
"""

# Install required packages
import subprocess
import sys

def install_package(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

try:
    import onnx
except ImportError:
    print("Installing onnx...")
    install_package("onnx")
    import onnx

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, random_split
import requests
import matplotlib.pyplot as plt
from PIL import Image, ImageFilter
import gc

# Shape categories (same order as your original)
categories = ['circle', 'square', 'triangle', 'hexagon', 'octagon', 'star']

class SmartUpscaleDataset(Dataset):
    """Memory-efficient dataset that upscales 28x28 to 56x56 on-the-fly"""
    
    def __init__(self, samples_per_category=5000):
        self.data = []
        self.labels = []
        
        print("Creating memory-efficient dataset...")
        
        for idx, category in enumerate(categories):
            print(f"Loading {category}...")
            url = f'https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/{category}.npy'
            r = requests.get(url)
            with open(f'{category}.npy', 'wb') as f:
                f.write(r.content)
            
            # Load and use fewer samples
            images = np.load(f'{category}.npy')
            images = images[:samples_per_category]  # Much fewer samples
            
            # Store indices instead of actual images to save memory
            for i in range(len(images)):
                self.data.append((category, i))  # Store category and index
                self.labels.append(idx)
            
            # Keep only this category's data in memory temporarily
            setattr(self, f'{category}_images', images)
            
            print(f"  Loaded {len(images)} samples for {category}")
        
        print(f"Total dataset size: {len(self.data)} samples")
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        category, img_idx = self.data[idx]
        label = self.labels[idx]
        
        # Load the specific image
        images = getattr(self, f'{category}_images')
        img_28 = images[img_idx].reshape(28, 28).astype(np.float32) / 255.0
        
        # Smart upscale 28x28 to 56x56 using PIL for better quality
        img_pil = Image.fromarray((img_28 * 255).astype(np.uint8), mode='L')
        
        # Upscale with high-quality resampling
        img_56 = img_pil.resize((56, 56), Image.LANCZOS)
        
        # Apply slight blur to smooth pixelation, then sharpen edges
        img_56 = img_56.filter(ImageFilter.SMOOTH_MORE)
        img_56 = img_56.filter(ImageFilter.EDGE_ENHANCE)
        
        # Convert back to tensor
        img_array = np.array(img_56).astype(np.float32) / 255.0
        
        return torch.tensor(img_array).unsqueeze(0), torch.tensor(label, dtype=torch.long)

# Create memory-efficient dataset
dataset = SmartUpscaleDataset(samples_per_category=5000)  # Only 5k per category

# Train/Validation/Test Split (80/10/10)
total_size = len(dataset)
train_size = int(0.8 * total_size)
val_size = int(0.1 * total_size) 
test_size = total_size - train_size - val_size

train_ds, val_ds, test_ds = random_split(dataset, [train_size, val_size, test_size])
print(f"Train: {len(train_ds)}, Val: {len(val_ds)}, Test: {len(test_ds)}")

# Use smaller batch sizes for memory efficiency
train_loader = DataLoader(train_ds, batch_size=64, shuffle=True, num_workers=0)
val_loader = DataLoader(val_ds, batch_size=64, shuffle=False, num_workers=0)
test_loader = DataLoader(test_ds, batch_size=64, shuffle=False, num_workers=0)

# Memory-efficient CNN model for 56x56 input
class EfficientShapeCNN(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        
        # Optimized for 56x56 input (3 pooling layers: 56->28->14->7)
        self.conv = nn.Sequential(
            # First conv block (56x56 -> 28x28)
            nn.Conv2d(1, 32, 3, padding=1), 
            nn.BatchNorm2d(32),
            nn.ReLU(), 
            nn.MaxPool2d(2),
            nn.Dropout2d(0.25),
            
            # Second conv block (28x28 -> 14x14)
            nn.Conv2d(32, 64, 3, padding=1), 
            nn.BatchNorm2d(64),
            nn.ReLU(), 
            nn.MaxPool2d(2),
            nn.Dropout2d(0.25),
            
            # Third conv block (14x14 -> 7x7)
            nn.Conv2d(64, 128, 3, padding=1), 
            nn.BatchNorm2d(128),
            nn.ReLU(), 
            nn.MaxPool2d(2),
            nn.Dropout2d(0.25)
        )
        
        self.fc = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 7 * 7, 256), 
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, 128),
            nn.ReLU(), 
            nn.Dropout(0.5),
            nn.Linear(128, num_classes)
        )
    
    def forward(self, x):
        x = self.conv(x)
        return self.fc(x)

model = EfficientShapeCNN(num_classes=len(categories))
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)

print(f"Using device: {device}")
print(f"Input size: 56x56")
print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")

# Training setup
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'max', patience=3, factor=0.5)

# Training function with memory management
def evaluate_model(model, loader, device):
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for inputs, targets in loader:
            inputs, targets = inputs.to(device), targets.to(device)
            outputs = model(inputs)
            _, predicted = torch.max(outputs, 1)
            total += targets.size(0)
            correct += (predicted == targets).sum().item()
            
            # Clear GPU cache
            del inputs, targets, outputs
            if device.type == 'cuda':
                torch.cuda.empty_cache()
    
    return 100 * correct / total

# Training loop with memory management
epochs = 15  # Fewer epochs but should still work well
train_losses = []
train_accs = []
val_accs = []

print("\nStarting memory-efficient training...")
for epoch in range(epochs):
    model.train()
    epoch_loss = 0
    correct_train = 0
    total_train = 0
    
    for batch_idx, (inputs, targets) in enumerate(train_loader):
        inputs, targets = inputs.to(device), targets.to(device)
        
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        
        epoch_loss += loss.item()
        _, predicted = torch.max(outputs, 1)
        total_train += targets.size(0)
        correct_train += (predicted == targets).sum().item()
        
        # Memory cleanup every few batches
        if batch_idx % 20 == 0:
            del inputs, targets, outputs
            if device.type == 'cuda':
                torch.cuda.empty_cache()
            gc.collect()
    
    # Calculate metrics
    avg_loss = epoch_loss / len(train_loader)
    train_acc = 100 * correct_train / total_train
    val_acc = evaluate_model(model, val_loader, device)
    
    train_losses.append(avg_loss)
    train_accs.append(train_acc)
    val_accs.append(val_acc)
    
    # Learning rate scheduling
    scheduler.step(val_acc)
    
    print(f"Epoch {epoch+1:2d}/{epochs}: "
          f"Loss: {avg_loss:.4f}, "
          f"Train Acc: {train_acc:.2f}%, "
          f"Val Acc: {val_acc:.2f}%")
    
    # Memory cleanup after each epoch
    if device.type == 'cuda':
        torch.cuda.empty_cache()
    gc.collect()

# Final test evaluation
test_acc = evaluate_model(model, test_loader, device)
print(f"\nFinal Test Accuracy: {test_acc:.2f}%")

# Export model
print("Exporting efficient model...")
dummy_input = torch.randn(1, 1, 56, 56, device=device)
model_filename = "shape_efficient_56x56.onnx"
torch.onnx.export(
    model,
    dummy_input,
    model_filename,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    opset_version=11
)
print(f"Exported {model_filename} successfully.")

# Plot training curves
plt.figure(figsize=(12, 4))

plt.subplot(1, 2, 1)
plt.plot(train_losses)
plt.title('Training Loss')
plt.xlabel('Epoch')
plt.ylabel('Loss')

plt.subplot(1, 2, 2)
plt.plot(train_accs, label='Train Acc')
plt.plot(val_accs, label='Val Acc')
plt.title('Accuracy')
plt.xlabel('Epoch')
plt.ylabel('Accuracy (%)')
plt.legend()
plt.tight_layout()
plt.savefig('training_curves_efficient.png')
plt.show()

print(f"\nCategories (in order): {categories}")
print(f"Model saved as {model_filename}")
print(f"Memory usage optimized: 56x56 resolution, 5k samples per category")
print("This should work on Colab without crashing!") 