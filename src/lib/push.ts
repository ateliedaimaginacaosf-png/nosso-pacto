import { supabase } from '@/integrations/supabase/client';

/**
 * Send a push notification to a user via the send-push edge function.
 * This is called from client code when creating notifications.
 */
export async function sendPushToUser(params: {
  user_id: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}) {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: params,
    });
    
    if (error) {
      console.error('Error sending push notification:', error);
    }
    return data;
  } catch (e) {
    console.error('Error invoking send-push:', e);
  }
}
