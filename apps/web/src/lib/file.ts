import type { ProposalStartFile } from '../domain/contracts';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('No se pudo leer el PDF seleccionado.'));
    };

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('La carga del PDF devolvió un formato inesperado.'));
        return;
      }

      resolve(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

export function validatePdfFile(file: File): void {
  const isPdfMime = file.type === 'application/pdf';
  const isPdfName = file.name.toLowerCase().endsWith('.pdf');

  if (!isPdfMime && !isPdfName) {
    throw new Error('Solo se admiten PDFs en esta v1.');
  }
}

export async function toProposalStartFile(file: File): Promise<ProposalStartFile> {
  validatePdfFile(file);
  const dataUrl = await readAsDataUrl(file);
  const base64 = dataUrl.split(',')[1];

  if (!base64) {
    throw new Error('No se pudo convertir el PDF a base64.');
  }

  return {
    file_name: file.name,
    mime_type: 'application/pdf',
    content_base64: base64,
  };
}
