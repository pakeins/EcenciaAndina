import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ImageUpload } from './ImageUpload';

describe('ImageUpload', () => {
  it('renderiza correctamente en estado vacío', () => {
    const onChange = vi.fn();
    render(<ImageUpload value={null} onChange={onChange} />);
    
    expect(screen.getByText('Click o arrastra la foto del menú')).toBeInTheDocument();
  });

  it('renderiza la imagen de vista previa si hay un valor', () => {
    const onChange = vi.fn();
    render(<ImageUpload value="data:image/png;base64,mock" onChange={onChange} />);
    
    const img = screen.getByRole('img', { name: /preview/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,mock');
  });

  it('llama a onChange con null al hacer click en el botón de eliminar', () => {
    const onChange = vi.fn();
    render(<ImageUpload value="data:image/png;base64,mock" onChange={onChange} />);
    
    const removeBtn = screen.getByRole('button');
    fireEvent.click(removeBtn);
    
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('procesa la carga de archivos al cambiar el input', async () => {
    const onChange = vi.fn();
    render(<ImageUpload value={null} onChange={onChange} />);
    
    // Simular archivo
    const file = new File(['mock content'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Click o arrastra/i) as HTMLInputElement;
    
    // Mockear FileReader
    class MockFileReader {
      onload: ((e: { target: { result: string } }) => void) | null = null;
      readAsDataURL(blob: Blob) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,result' } });
          }
        }, 0);
      }
    }
    window.FileReader = MockFileReader as unknown as typeof FileReader;

    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('data:image/png;base64,result');
    });
  });
});
