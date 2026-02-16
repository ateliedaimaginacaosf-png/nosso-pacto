import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Coins, Loader2, Copy, Check, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useRef, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Profile = Tables<"profiles">;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function getAvatarUrl(path: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

export default function GerenciarMembros() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [childName, setChildName] = useState("");
  const [childEmail, setChildEmail] = useState("");
  const [childPassword, setChildPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [childPhoto, setChildPhoto] = useState<File | null>(null);
  const [childPhotoPreview, setChildPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const { data: membros, isLoading } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("tipo_perfil", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const { data: familia } = useQuery({
    queryKey: ["familia-info", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("familia")
        .select("*")
        .eq("id", profile!.familia_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const copyFamiliaId = () => {
    if (profile?.familia_id) {
      navigator.clipboard.writeText(profile.familia_id);
      setCopied(true);
      toast({ title: "ID copiado!", description: "Compartilhe com a criança no cadastro." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleChildPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
      return;
    }
    setChildPhoto(file);
    setChildPhotoPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (userId: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const handleCreateChild = async () => {
    if (!childName.trim() || !childEmail.trim() || !childPassword.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (childPassword.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await supabase.functions.invoke("create-child", {
        body: { nome: childName.trim(), email: childEmail.trim(), password: childPassword },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || res.error?.message || "Erro ao criar criança");
      }

      const newUserId = res.data.userId;

      // Upload photo if selected
      if (childPhoto && newUserId) {
        try {
          const avatarPath = await uploadAvatar(newUserId, childPhoto);
          await supabase
            .from("profiles")
            .update({ foto_url: avatarPath })
            .eq("user_id", newUserId);
        } catch {
          // Non-critical: profile created but photo failed
          toast({ title: "Perfil criado, mas erro ao enviar foto", variant: "destructive" });
        }
      }

      toast({ title: "Criança adicionada! 🎉", description: `${childName} agora faz parte da família.` });
      setChildName("");
      setChildEmail("");
      setChildPassword("");
      setChildPhoto(null);
      setChildPhotoPreview(null);
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["membros-familia"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleMemberPhotoUpload = async (membro: Profile, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
      return;
    }
    setUploadingFor(membro.id);
    try {
      const avatarPath = await uploadAvatar(membro.user_id, file);
      await supabase.from("profiles").update({ foto_url: avatarPath }).eq("id", membro.id);
      toast({ title: "Foto atualizada! 📸" });
      queryClient.invalidateQueries({ queryKey: ["membros-familia"] });
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFor(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Membros 👨‍👩‍👧‍👦</h1>
            <p className="text-muted-foreground">Família: {familia?.nome ?? "Carregando..."}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Adicionar Criança</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Criança 👧</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Photo upload */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-primary/30 bg-muted transition hover:border-primary/60"
                  >
                    {childPhotoPreview ? (
                      <img src={childPhotoPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-7 w-7 text-muted-foreground group-hover:text-primary" />
                    )}
                  </button>
                  <span className="text-xs text-muted-foreground">Foto (opcional)</span>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChildPhotoSelect} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="child-name">Nome da criança</Label>
                  <Input id="child-name" placeholder="Ex: Maria" value={childName} onChange={(e) => setChildName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="child-email">Email de acesso</Label>
                  <Input id="child-email" type="email" placeholder="maria@email.com" value={childEmail} onChange={(e) => setChildEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="child-password">Senha</Label>
                  <Input id="child-password" type="password" placeholder="Mínimo 6 caracteres" value={childPassword} onChange={(e) => setChildPassword(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateChild} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Criar Perfil
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Family ID sharing */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="py-4">
              <p className="mb-2 text-sm font-medium">Ou compartilhe este ID da família para cadastro manual:</p>
              <div className="flex items-center gap-2">
                <Input value={profile?.familia_id ?? ""} readOnly className="font-mono text-sm" />
                <Button size="sm" variant="outline" onClick={copyFamiliaId}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {membros?.map((membro, i) => (
              <motion.div key={membro.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="border-2">
                  <CardContent className="flex items-center gap-4 py-4">
                    {/* Avatar with upload */}
                    <label className="group relative cursor-pointer">
                      <Avatar className="h-14 w-14 border-2 border-primary/10">
                        <AvatarImage src={getAvatarUrl(membro.foto_url) ?? undefined} alt={membro.nome} />
                        <AvatarFallback className="bg-primary/10 text-xl">
                          {membro.tipo_perfil === "responsavel" ? "👨‍💼" : "👧"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
                        {uploadingFor === membro.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : (
                          <Camera className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleMemberPhotoUpload(membro, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg font-semibold truncate">{membro.nome}</p>
                      <p className="text-sm capitalize text-muted-foreground">{membro.tipo_perfil}</p>
                      {membro.tipo_perfil === "crianca" && (
                        <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-coin-foreground">
                          <Coins className="h-3.5 w-3.5 text-coin" /> {membro.saldo_moedas} moedas
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
