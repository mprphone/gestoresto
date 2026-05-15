import React, { useEffect, useState } from 'react';
import { apiGetBlob } from '../data/apiClient';

interface AuthenticatedArchivePreviewProps {
  archiveDocumentId?: string;
  mimeType?: string;
  fallbackUrl?: string;
  className?: string;
  title?: string;
  alt?: string;
}

const AuthenticatedArchivePreview: React.FC<AuthenticatedArchivePreviewProps> = ({
  archiveDocumentId,
  mimeType,
  fallbackUrl,
  className,
  title = 'Documento',
  alt = 'Documento'
}) => {
  const [objectUrl, setObjectUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!archiveDocumentId) {
      setObjectUrl(undefined);
      return;
    }
    let active = true;
    let createdUrl: string | undefined;
    apiGetBlob(`/api/archive/file/${archiveDocumentId}`)
      .then(blob => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => setObjectUrl(undefined));
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [archiveDocumentId]);

  const src = objectUrl || fallbackUrl;
  if (!src) return null;
  if (mimeType === 'application/pdf') {
    return <iframe src={src} className={className} title={title} />;
  }
  return <img src={src} className={className} alt={alt} />;
};

export default AuthenticatedArchivePreview;
