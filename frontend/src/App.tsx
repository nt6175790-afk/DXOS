import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { PermissionProvider } from '@/contexts/PermissionContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AiConversationProvider } from '@/features/ai/AiConversationProvider';
import { router } from '@/router';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <OrganizationProvider>
            <PermissionProvider>
              <AiConversationProvider>
                <RouterProvider router={router} />
              </AiConversationProvider>
            </PermissionProvider>
          </OrganizationProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

