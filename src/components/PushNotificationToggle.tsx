import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

export function PushNotificationToggle() {
  const { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.info('Notificações push desativadas');
    } else {
      const success = await subscribe();
      if (success) {
        toast.success('Notificações push ativadas! 🔔');
      } else if (permission === 'denied') {
        toast.error('Permissão negada. Habilite nas configurações do navegador.');
      } else {
        toast.error('Não foi possível ativar as notificações.');
      }
    }
  };

  return (
    <Button
      variant={isSubscribed ? 'secondary' : 'outline'}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className="gap-2"
    >
      {isSubscribed ? (
        <>
          <Bell className="h-4 w-4" />
          <span className="hidden sm:inline">Notificações ativas</span>
        </>
      ) : (
        <>
          <BellOff className="h-4 w-4" />
          <span className="hidden sm:inline">Ativar notificações</span>
        </>
      )}
    </Button>
  );
}
