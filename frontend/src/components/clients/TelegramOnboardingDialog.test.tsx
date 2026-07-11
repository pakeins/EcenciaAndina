import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramOnboardingDialog } from './TelegramOnboardingDialog';

// Mock dependencias
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mocked-qr-code')
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('TelegramOnboardingDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnRetryEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock window.open
    window.open = vi.fn();
  });

  const baseProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    clientName: 'Juan Perez',
    onboarding: {
      status: 'pending' as any,
      onboarding_url: 'https://t.me/bot?start=123',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
  };

  it('no renderiza nada si open es false (Dialog behavior)', () => {
    render(<TelegramOnboardingDialog {...baseProps} open={false} />);
    expect(screen.queryByText('Activacion por Telegram')).not.toBeInTheDocument();
  });

  it('renderiza con un enlace de onboarding y muestra QR', async () => {
    render(<TelegramOnboardingDialog {...baseProps} />);
    
    expect(screen.getByText('Activacion por Telegram')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://t.me/bot?start=123')).toBeInTheDocument();
    
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'data:image/png;base64,mocked-qr-code');
    });
  });

  it('maneja diferentes estados de entrega de correo: not_configured', () => {
    const props = {
      ...baseProps,
      onboarding: {
        ...baseProps.onboarding,
        email_delivery: { status: 'not_configured' as any }
      }
    };
    render(<TelegramOnboardingDialog {...props} />);
    expect(screen.getByText('Resend aun no esta configurado. El enlace y el QR siguen disponibles.')).toBeInTheDocument();
  });

  it('maneja diferentes estados de entrega de correo: sent', () => {
    const props = {
      ...baseProps,
      onboarding: {
        ...baseProps.onboarding,
        status: 'sent' as any,
        email_delivery: { status: 'sent' as any, recipient: 'juan@test.com' }
      }
    };
    render(<TelegramOnboardingDialog {...props} />);
    expect(screen.getByText('Invitacion enviada a juan@test.com.')).toBeInTheDocument();
    expect(screen.getByText('El aviso de consentimiento fue enviado directamente a Juan Perez.')).toBeInTheDocument();
  });

  it('maneja diferentes estados de entrega de correo: failed', () => {
    const props = {
      ...baseProps,
      onboarding: {
        ...baseProps.onboarding,
        email_delivery: { status: 'failed' as any, recipient: 'juan@test.com' }
      }
    };
    render(<TelegramOnboardingDialog {...props} />);
    expect(screen.getByText('No se pudo enviar el correo a juan@test.com.')).toBeInTheDocument();
  });

  it('permite copiar el enlace', async () => {
    render(<TelegramOnboardingDialog {...baseProps} />);
    
    const copyButton = screen.getByRole('button', { name: /Copiar/i });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://t.me/bot?start=123');
    
    await waitFor(() => {
      expect(screen.getByText('Copiado')).toBeInTheDocument();
    });
    
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Enlace de Telegram copiado.');
  });

  it('permite abrir el enlace en Telegram', () => {
    render(<TelegramOnboardingDialog {...baseProps} />);
    
    const openButton = screen.getByRole('button', { name: /Abrir Telegram/i });
    fireEvent.click(openButton);

    expect(window.open).toHaveBeenCalledWith('https://t.me/bot?start=123', '_blank', 'noopener,noreferrer');
  });

  it('muestra la interfaz alternativa si no hay onboarding_url (Reinvitación directa)', () => {
    const props = {
      ...baseProps,
      onboarding: {
        status: 'sent' as any,
        onboarding_url: null,
      }
    };
    render(<TelegramOnboardingDialog {...props} />);
    
    expect(screen.getByText('Telegram recibio el aviso en el chat ya vinculado.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/https:/)).not.toBeInTheDocument();
    
    const closeButton = screen.getByRole('button', { name: /Cerrar/i });
    fireEvent.click(closeButton);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('permite reintentar el correo si hay un fallo y se pasa onRetryEmail', () => {
    const props = {
      ...baseProps,
      onboarding: {
        ...baseProps.onboarding,
        email_delivery: { status: 'failed' as any }
      },
      onRetryEmail: mockOnRetryEmail,
      retryingEmail: false
    };
    render(<TelegramOnboardingDialog {...props} />);
    
    const retryButton = screen.getByRole('button', { name: /Reintentar correo/i });
    fireEvent.click(retryButton);
    expect(mockOnRetryEmail).toHaveBeenCalledTimes(1);
  });
  
  it('deshabilita el boton de reintentar si retryingEmail es true', () => {
    const props = {
      ...baseProps,
      onboarding: {
        ...baseProps.onboarding,
        email_delivery: { status: 'failed' as any }
      },
      onRetryEmail: mockOnRetryEmail,
      retryingEmail: true
    };
    render(<TelegramOnboardingDialog {...props} />);
    
    const retryButton = screen.getByRole('button', { name: /Reintentar correo/i });
    expect(retryButton).toBeDisabled();
  });
  
  it('maneja el error si falla la generacion del QR', async () => {
    const qrcode = await import('qrcode');
    vi.mocked(qrcode.default.toDataURL).mockRejectedValueOnce(new Error('QR Error'));
    
    render(<TelegramOnboardingDialog {...baseProps} />);
    
    const { toast } = await import('sonner');
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No se pudo generar el QR.');
    });
  });
});
