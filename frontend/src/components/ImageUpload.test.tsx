import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ImageUpload } from './ImageUpload';

describe('ImageUpload', () => {
  it('renderiza el estado inicial vacío', () => {
    const handleChange = vi.fn();
    render(<ImageUpload value={null} onChange={handleChange} />);
    expect(screen.getByText(/Click o arrastra la foto del menú/i)).toBeInTheDocument();
  });

  it('renderiza la imagen cuando hay un valor', () => {
    const handleChange = vi.fn();
    render(<ImageUpload value="data:image/png;base64,mock" onChange={handleChange} />);
    
    const img = screen.getByAltText('Preview');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,mock');
  });

  it('permite eliminar la imagen (llama a onChange con null)', () => {
    const handleChange = vi.fn();
    render(<ImageUpload value="data:image/png;base64,mock" onChange={handleChange} />);
    
    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);
    
    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it('maneja el evento change de un archivo de imagen', async () => {
    const handleChange = vi.fn();
    const { container } = render(<ImageUpload value={null} onChange={handleChange} />);
    
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['mock-image-content'], 'test.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalled();
    });
  });

  it('ignora el cambio si el archivo no es una imagen', async () => {
    const handleChange = vi.fn();
    const { container } = render(<ImageUpload value={null} onChange={handleChange} />);
    
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    // Wait a brief moment to ensure it is not called
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('maneja eventos drag and drop con archivos de imagen', async () => {
    const handleChange = vi.fn();
    const { container } = render(<ImageUpload value={null} onChange={handleChange} />);
    
    const dropzone = container.firstChild?.firstChild as HTMLElement;
    
    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain('border-primary');
    
    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('bg-primary/5');

    const file = new File(['test-drag'], 'test.png', { type: 'image/png' });
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalled();
    });
  });

  it('ignora drag and drop si el archivo no es una imagen', async () => {
    const handleChange = vi.fn();
    const { container } = render(<ImageUpload value={null} onChange={handleChange} />);
    
    const dropzone = container.firstChild?.firstChild as HTMLElement;
    const file = new File(['test-drag-plain'], 'test.txt', { type: 'text/plain' });
    
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file]
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handleChange).not.toHaveBeenCalled();
  });
});
