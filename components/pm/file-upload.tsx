'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, FileSpreadsheet, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // Base64
  content?: string; // Extracted text content
}

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  onFilesChange: (files: UploadedFile[]) => void;
  files: UploadedFile[];
  label?: string;
  description?: string;
}

export function FileUpload({
  accept = '.pdf,.doc,.docx,.xls,.xlsx',
  multiple = true,
  onFilesChange,
  files,
  label = 'Încarcă fișiere',
  description = 'Glisați fișierele aici sau click pentru a selecta',
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFiles = useCallback(
    async (fileList: FileList) => {
      const newFiles: UploadedFile[] = [];

      for (const file of Array.from(fileList)) {
        const reader = new FileReader();

        await new Promise<void>((resolve) => {
          reader.onload = () => {
            newFiles.push({
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              type: file.type,
              size: file.size,
              data: reader.result as string,
            });
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }

      if (multiple) {
        onFilesChange([...files, ...newFiles]);
      } else {
        onFilesChange(newFiles.slice(0, 1));
      }
    },
    [files, multiple, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer.files) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.includes('spreadsheet') || type.includes('excel') || type.includes('xlsx')) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    if (type.includes('pdf')) {
      return <FileText className="h-5 w-5 text-red-600" />;
    }
    if (type.includes('word') || type.includes('document')) {
      return <FileText className="h-5 w-5 text-blue-600" />;
    }
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getFileIcon(file.type)}
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[250px]">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeFile(file.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { UploadedFile };
