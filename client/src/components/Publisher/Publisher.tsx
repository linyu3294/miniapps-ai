import React, { useState, FormEvent, ChangeEvent, DragEvent } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import JSZip from 'jszip';
import './Publisher.css';

interface FileInfo {
  filename: string;
  size: number;
  type: string;
}

interface Icon {
  src: string;
  sizes: string;
  type: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: Icon[];
}

interface PublishRequest {
  manifest: Manifest;
  files: FileInfo[];
  entrypoint: string;
  version_notes: string;
  publisher_id: string;
}

interface PublishResponse {
  message: string;
  presigned_url: string;
}

const PublisherComponent = (): React.JSX.Element => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [presignedUrl, setPresignedUrl] = useState<string>('');
  
  // Form data
  const [appSlug, setAppSlug] = useState<string>('');
  const [versionId, setVersionId] = useState<string>('');
  const [versionNotes, setVersionNotes] = useState<string>('');
  const [entrypoint, setEntrypoint] = useState<string>('');
  const [publisherId, setPublisherId] = useState<string>('');
  
  // File handling
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [manifestData, setManifestData] = useState<Manifest | undefined>(undefined);
  const [parsedFiles, setParsedFiles] = useState<FileInfo[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const parseManifest = async (fileArray: File[]): Promise<Manifest | undefined> => {
    let manifest: Manifest | undefined;
    try{
      const manifestText = await fileArray.find( 
        file => file.name === 'manifest.json')?.text();
      if (manifestText) {
        manifest = JSON.parse(manifestText);
        setManifestData(manifest);
      }
    } catch (err) {
      setError('Failed to parse manifest.json');
    }
    return manifest;
  }

  const handleFileUpload = async (files: FileList | File[]): Promise<void> => {
    setError('');
    setMessage('');
    const fileArray = Array.from(files);
    const fileInfos: FileInfo[] = [];
    setUploadedFiles(fileArray);

    fileArray.forEach(async (file) => {
      const fileInfo: FileInfo = {
        filename: file.name,
        size: file.size,
        type: file.type || getMimeType(file.name)
      };
      fileInfos.push(fileInfo);
    });
    setParsedFiles(fileInfos);

    const manifest = await parseManifest(fileArray);
    if (manifest?.start_url && !entrypoint) {
      setEntrypoint(manifest.start_url);
    }
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      'json': 'application/json',
      'js': 'application/javascript',
      'html': 'text/html',
      'css': 'text/css',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      'wasm': 'application/wasm',
      'onnx': 'application/octet-stream'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const validateFiles = (): string | null => {
    if (parsedFiles.length === 0) {
      return 'No files uploaded';
    }
    
    // Check for required files
    const hasManifest = parsedFiles.some(f => f.filename === 'manifest.json');
    const hasModelOnnx = parsedFiles.some(f => f.filename === 'model.onnx');
    const hasJsOrWasm = parsedFiles.some(f => 
      f.type === 'application/javascript' || f.type === 'text/javascript' || f.type === 'application/wasm'
    );
    const hasHtml = parsedFiles.some(f => f.type === 'text/html');
    
    if (!hasManifest) return 'manifest.json is required';
    if (!hasModelOnnx) return 'model.onnx is required';
    if (!hasJsOrWasm) return 'At least one .js or .wasm file is required';
    if (!hasHtml) return 'At least one HTML file is required';
    
    // Check file sizes
    const modelOnnxFile = parsedFiles.find(f => f.filename === 'model.onnx');
    if (modelOnnxFile && modelOnnxFile.size > 25 * 1024 * 1024) {
      return 'model.onnx file size exceeds 25MB limit';
    }
    
    const totalSize = parsedFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 100 * 1024 * 1024) {
      return 'Total file size exceeds 100MB limit';
    }
    
    return null;
  };


  const validateAppSubmission = async () => {
    if (!appSlug || !versionId || !versionNotes || !entrypoint || !publisherId) {
      setError('All fields are required');
      throw new Error(`Form validation failed: ${appSlug}, ${versionId}, ${versionNotes}, ${entrypoint}, ${publisherId}`);
    }
    const fileError = validateFiles();
    if (fileError) {
      setError(fileError);
      throw new Error(fileError);
    }
    if (!manifestData) {
      setError('Manifest data is required');
      throw new Error('Manifest data is required');
    }
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken.toString(); 
    if (!accessToken) {
      setError('Authentication required');
      throw new Error('Authentication required');
    }
  }

  const getPresignedUrl = async (): Promise<void> => {
    const requestBody: PublishRequest = {
      manifest: manifestData!,
      files: parsedFiles,
      entrypoint,
      version_notes: versionNotes,
      publisher_id: publisherId
    };
    
    const apiDomain = import.meta.env.VITE_API_GATEWAY_HTTPS_URL;
    const apiUrl = `${apiDomain}/publish/${appSlug}/version/${versionId}`;
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken.toString(); 
    const response = await fetch(apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    } 
    const responseData: PublishResponse = await response.json();
    setPresignedUrl(responseData.presigned_url);
    setMessage('Files validated successfully! Use the presigned URL to upload your files.');
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    console.log('handleSubmit called');
    setError('');
    setMessage('');
    setIsLoading(true);

    await validateAppSubmission();
    try {
      await getPresignedUrl();
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const createZipFromFiles = async (files: File[]): Promise<Blob> => {
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.name, file);
    }
    return await zip.generateAsync({ type: 'blob' });
  };

  const uploadBlobToS3 = async (url: string, blob: Blob): Promise<void> => {
    const uploadResponse = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'application/zip'
      }
    });
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
  };

  const handleUploadToS3 = async (): Promise<void> => {
    if (!presignedUrl || uploadedFiles.length === 0) {
      setError('No presigned URL or files available');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      setMessage('Creating ZIP file from uploaded files...');
      const zipBlob = await createZipFromFiles(uploadedFiles);
  
      setMessage('Uploading files to S3...');
      await uploadBlobToS3(presignedUrl, zipBlob);

      setMessage('Files uploaded successfully to S3!');
      setPresignedUrl('');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('S3 upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Publish Your App</h2>
        
        {error && <p className="error">{error}</p>}
        {message && <p className="message">{message}</p>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>App Slug</label>
              <input
                type="text"
                value={appSlug}
                onChange={(e) => setAppSlug(e.target.value)}
                placeholder="my-app-name"
                required
              />
            </div>
            <div className="form-group">
              <label>Version ID</label>
              <input
                type="text"
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                placeholder="v1.0.0"
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Publisher ID</label>
            <input
              type="text"
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              placeholder="your-publisher-id"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Entrypoint</label>
            <input
              type="text"
              value={entrypoint}
              onChange={(e) => setEntrypoint(e.target.value)}
              placeholder="index.html"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Version Notes</label>
            <textarea
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              placeholder="Describe what's new in this version..."
              required
            />
          </div>
          
          <div className="form-group">
            <label>Upload Files</label>
            <div
              className={`file-upload-area ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                multiple
                onChange={handleFileInputChange}
                accept=".json,.js,.html,.css,.png,.jpg,.jpeg,.svg,.ico,.wasm,.onnx,.zip"
                className="file-input"
              />
              <div className="upload-content">
                <p>Drag and drop files here, or click to select</p>
                <p className="upload-hint">Include: manifest.json, model.onnx, UI files, etc.</p>
              </div>
            </div>
          </div>
          
          {uploadedFiles.length > 0 && (
            <div className="file-list">
              <h4>Uploaded Files ({uploadedFiles.length})</h4>
              <ul>
                {uploadedFiles.map((file, index) => (
                  <li key={index}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {manifestData && (
            <div className="manifest-preview">
              <h4>Manifest Preview</h4>
              <pre>{JSON.stringify(manifestData, null, 2)}</pre>
            </div>
          )}
          
          <button 
            type="submit" 
            className="publisher-button"
            disabled={isLoading}
          >
            {isLoading ? 'Validating...' : 'Validate & Get Upload URL'}
          </button>
        </form>
        
        {presignedUrl && (
          <div className="upload-section">
            <h3>Upload to S3</h3>
            <p>Your files have been validated. Click below to upload them to S3:</p>
            <button 
              onClick={handleUploadToS3}
              className="publisher-button upload"
              disabled={isLoading}
            >
              {isLoading ? 'Uploading...' : 'Upload to S3'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublisherComponent; 