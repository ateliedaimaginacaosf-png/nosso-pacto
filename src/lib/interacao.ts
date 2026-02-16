import { supabase } from "@/integrations/supabase/client";

export async function uploadInteracaoFoto(
  userId: string,
  tarefaId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${tarefaId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("tarefa-fotos")
    .upload(path, file, { upsert: true });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("tarefa-fotos")
    .getPublicUrl(path);

  return urlData.publicUrl;
}

export async function salvarInteracao({
  tarefaId,
  familiaId,
  userId,
  statusAnterior,
  statusNovo,
  mensagem,
  foto,
}: {
  tarefaId: string;
  familiaId: string;
  userId: string;
  statusAnterior: string | null;
  statusNovo: string;
  mensagem: string;
  foto: File | null;
}) {
  let fotoUrl: string | null = null;

  if (foto) {
    fotoUrl = await uploadInteracaoFoto(userId, tarefaId, foto);
  }

  const { error } = await supabase.from("tarefa_interacao").insert({
    tarefa_id: tarefaId,
    familia_id: familiaId,
    user_id: userId,
    status_anterior: statusAnterior,
    status_novo: statusNovo,
    mensagem: mensagem || null,
    foto_url: fotoUrl,
  });

  if (error) throw error;
}
