import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Coins, Loader2, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

export default function GerenciarMembros() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

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

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Membros 👨‍👩‍👧‍👦</h1>
          <p className="text-muted-foreground">Família: {familia?.nome ?? "Carregando..."}</p>
        </motion.div>

        {/* Family ID sharing */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="py-4">
              <p className="mb-2 text-sm font-medium">Para adicionar uma criança, compartilhe este ID da família no cadastro:</p>
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
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                      {membro.tipo_perfil === "responsavel" ? "👨‍💼" : "👧"}
                    </div>
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
