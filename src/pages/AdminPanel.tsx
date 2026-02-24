import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Loader2, RefreshCw, Users, Trash2, Power, PowerOff, UserPlus, ShieldAlert, ChevronDown, ChevronUp, Package, ListTodo, CalendarX2, FileText, BookOpen, Home, RotateCcw, ImageIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MemberDetail {
  user_id: string;
  nome: string;
  tipo_perfil: string;
  saldo_moedas: number;
  data_nascimento: string | null;
  created_at: string;
  email: string;
  email_confirmed: boolean;
  last_sign_in: string | null;
}

interface FamilyData {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  onboarding_dismissed: boolean;
  members: MemberDetail[];
  subscription: {
    status: string;
    plataforma: string;
    data_ativacao: string;
    data_expiracao: string | null;
  } | null;
  tarefa_count: number;
  tarefa_padrao_count: number;
  recompensa_count: number;
}

async function adminAction(action: string, params: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-manage", {
    body: { action, ...params },
  });
  if (error) throw error;
  return data;
}

export default function AdminPanel() {
  const { role, loading: authLoading } = useAuth();
  const [families, setFamilies] = useState<FamilyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({ open: false, title: "", description: "", onConfirm: async () => {} });
  const [createUserDialog, setCreateUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    nome: "",
    tipo_perfil: "responsavel" as string,
    familia_id: "" as string,
  });
  const [createTrialDialog, setCreateTrialDialog] = useState(false);
  const [trialData, setTrialData] = useState({
    email: "",
    password: "",
    nome: "",
    dias_trial: "30",
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [flowImageUrl, setFlowImageUrl] = useState<string | null>(null);
  const [flowImageLoading, setFlowImageLoading] = useState(false);

  const fetchFamilies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAction("list_families");
      setFamilies(data);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === "admin") fetchFamilies();
  }, [role, fetchFamilies]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const runAction = async (
    action: string,
    params: Record<string, any>,
    successMsg: string
  ) => {
    setActionLoading(true);
    try {
      await adminAction(action, params);
      toast({ title: "Sucesso", description: successMsg });
      await fetchFamilies();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    }
  };

  const confirm = (title: string, description: string, onConfirm: () => Promise<void>) => {
    setConfirmDialog({ open: true, title, description, onConfirm });
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.nome || !newUser.familia_id) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await adminAction("create_user", newUser);
      toast({ title: "Usuário criado com sucesso!" });
      setCreateUserDialog(false);
      setNewUser({ email: "", password: "", nome: "", tipo_perfil: "responsavel", familia_id: "" });
      await fetchFamilies();
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTrial = async () => {
    if (!trialData.email || !trialData.password || !trialData.nome || !trialData.dias_trial) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      const result = await adminAction("create_trial", {
        ...trialData,
        dias_trial: parseInt(trialData.dias_trial),
      });
      toast({
        title: "Conta trial criada!",
        description: `Família ativada até ${new Date(result.expira_em).toLocaleDateString("pt-BR")}`,
      });
      setCreateTrialDialog(false);
      setTrialData({ email: "", password: "", nome: "", dias_trial: "30" });
      await fetchFamilies();
    } catch (err: any) {
      toast({ title: "Erro ao criar trial", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleGenerateFlowImage = async () => {
    setFlowImageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-flow-image");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFlowImageUrl(data.url);
      toast({ title: "Imagem gerada com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar imagem", description: err.message, variant: "destructive" });
    } finally {
      setFlowImageLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Painel Admin</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="default" size="sm" onClick={() => setCreateTrialDialog(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> Criar Conta Trial
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreateUserDialog(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> Novo Usuário
            </Button>
            <Button variant="outline" size="sm" onClick={handleGenerateFlowImage} disabled={flowImageLoading}>
              {flowImageLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
              Gerar Imagem do Fluxo
            </Button>
            <Button variant="outline" size="sm" onClick={fetchFamilies} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Flow image preview */}
        {flowImageUrl && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Imagem do Fluxo</CardTitle>
                <a href={flowImageUrl} download target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <Download className="mr-1 h-4 w-4" /> Download
                  </Button>
                </a>
              </div>
            </CardHeader>
            <CardContent>
              <img src={flowImageUrl} alt="Fluxo do sistema Nosso Pacto" className="w-full rounded-lg border" />
            </CardContent>
          </Card>
        )}

        <div className="mb-4 rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
          <strong>{families.length}</strong> famílias cadastradas •{" "}
          <strong>{families.reduce((acc, f) => acc + f.members.length, 0)}</strong> membros totais •{" "}
          <strong>{families.filter((f) => f.ativo).length}</strong> ativas
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {families.map((family) => {
              const isExpanded = expandedFamily === family.id;
              return (
                <Card key={family.id} className="overflow-hidden">
                  <CardHeader
                    className="cursor-pointer pb-3"
                    onClick={() => setExpandedFamily(isExpanded ? null : family.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Home className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">{family.nome}</CardTitle>
                        <Badge variant={family.ativo ? "default" : "secondary"}>
                          {family.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                        {family.subscription && (
                          <Badge variant="outline" className="text-xs">
                            {family.subscription.plataforma} — {family.subscription.status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {family.members.length} membros • {family.tarefa_padrao_count} modelos • {family.tarefa_count} tarefas • {family.recompensa_count} recompensas
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Criada em {formatDate(family.created_at)} • ID: {family.id.slice(0, 8)}...
                    </p>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="border-t pt-4">
                      {/* Members */}
                      <h3 className="mb-2 text-sm font-semibold flex items-center gap-1">
                        <Users className="h-4 w-4" /> Membros
                      </h3>
                      <div className="mb-4 space-y-2">
                        {family.members.map((m) => (
                          <div
                            key={m.user_id}
                            className="flex flex-col gap-1 rounded-md border p-3 text-sm md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <span className="font-medium">{m.nome}</span>
                              <Badge variant="outline" className="ml-2 text-xs">
                                {m.tipo_perfil}
                              </Badge>
                              {m.email_confirmed && (
                                <Badge variant="outline" className="ml-1 text-xs text-green-600">
                                  ✓ email
                                </Badge>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {m.email} • Saldo: {m.saldo_moedas} moedas
                                {m.data_nascimento && ` • Nasc: ${m.data_nascimento}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Cadastro: {formatDate(m.created_at)} • Último login: {formatDate(m.last_sign_in)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <h3 className="mb-2 text-sm font-semibold">Ações</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              family.ativo ? "Desativar família?" : "Ativar família?",
                              `A família "${family.nome}" será ${family.ativo ? "desativada" : "ativada"}.`,
                              () =>
                                runAction(
                                  "toggle_familia",
                                  { familia_id: family.id, ativo: !family.ativo },
                                  `Família ${!family.ativo ? "ativada" : "desativada"}`
                                )
                            )
                          }
                        >
                          {family.ativo ? (
                            <><PowerOff className="mr-1 h-4 w-4" /> Desativar</>
                          ) : (
                            <><Power className="mr-1 h-4 w-4" /> Ativar</>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Limpar calendário?",
                              `Isso apagará TODAS as tarefas (instâncias e recorrências), resgates, transações, check-ins de deveres, badges e notificações da família "${family.nome}". Os saldos serão zerados. Modelos de tarefa e recompensas serão mantidos.`,
                              () =>
                                runAction("limpar_calendario", { familia_id: family.id }, "Calendário limpo")
                            )
                          }
                        >
                          <CalendarX2 className="mr-1 h-4 w-4" /> Limpar Calendário
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Apagar contrato?",
                              `Isso apagará todos os contratos, revisões e limpará os direitos/deveres/consequências de todas as crianças da família "${family.nome}".`,
                              () =>
                                runAction("delete_contrato", { familia_id: family.id }, "Contrato apagado")
                            )
                          }
                        >
                          <FileText className="mr-1 h-4 w-4" /> Apagar Contrato
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Excluir tarefas default?",
                              `Todos os modelos de tarefa (e recorrências) da família "${family.nome}" serão apagados.`,
                              () =>
                                runAction("reset_tarefas_default", { familia_id: family.id, mode: "delete" }, "Tarefas default excluídas")
                            )
                          }
                        >
                          <ListTodo className="mr-1 h-4 w-4" /> Excluir Tarefas Default
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Reinserir tarefas default?",
                              `Os modelos de tarefa atuais serão substituídos pelos padrões globais na família "${family.nome}".`,
                              () =>
                                runAction("reset_tarefas_default", { familia_id: family.id, mode: "insert" }, "Tarefas default reinseridas")
                            )
                          }
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Reinserir Tarefas Default
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Excluir recompensas default?",
                              `Todas as recompensas e resgates da família "${family.nome}" serão apagados.`,
                              () =>
                                runAction("reset_recompensas_default", { familia_id: family.id, mode: "delete" }, "Recompensas excluídas")
                            )
                          }
                        >
                          <Package className="mr-1 h-4 w-4" /> Excluir Recompensas
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Reinserir recompensas default?",
                              `As recompensas atuais serão substituídas pelos padrões globais na família "${family.nome}".`,
                              () =>
                                runAction("reset_recompensas_default", { familia_id: family.id, mode: "insert" }, "Recompensas reinseridas")
                            )
                          }
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Reinserir Recompensas
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "Inserir direitos/deveres?",
                              `Os direitos e deveres de todas as crianças da família "${family.nome}" serão preenchidos com os padrões por faixa etária.`,
                              () =>
                                runAction("insert_direitos_deveres", { familia_id: family.id }, "Direitos/deveres inseridos")
                            )
                          }
                        >
                          <BookOpen className="mr-1 h-4 w-4" /> Inserir Direitos/Deveres
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            confirm(
                              "⚠️ Apagar família inteira?",
                              `ATENÇÃO: Isso apagará TODOS os dados da família "${family.nome}", incluindo membros, tarefas, recompensas, moedas, contratos, badges e contas de usuário. Esta ação é IRREVERSÍVEL.`,
                              () =>
                                runAction("delete_familia", { familia_id: family.id }, "Família apagada")
                            )
                          }
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Apagar Família
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDialog.onConfirm} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create user dialog */}
      <Dialog open={createUserDialog} onOpenChange={setCreateUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Família</Label>
              <Select value={newUser.familia_id} onValueChange={(v) => setNewUser((p) => ({ ...p, familia_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a família" /></SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={newUser.nome} onChange={(e) => setNewUser((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type="password" value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div>
              <Label>Tipo de perfil</Label>
              <Select value={newUser.tipo_perfil} onValueChange={(v) => setNewUser((p) => ({ ...p, tipo_perfil: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="responsavel">Responsável</SelectItem>
                  <SelectItem value="crianca">Criança</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create trial dialog */}
      <Dialog open={createTrialDialog} onOpenChange={setCreateTrialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar conta trial (responsável)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do responsável</Label>
              <Input value={trialData.nome} onChange={(e) => setTrialData((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex: Maria Silva" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={trialData.email} onChange={(e) => setTrialData((p) => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type="password" value={trialData.password} onChange={(e) => setTrialData((p) => ({ ...p, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <Label>Dias de trial</Label>
              <Select value={trialData.dias_trial} onValueChange={(v) => setTrialData((p) => ({ ...p, dias_trial: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="14">14 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTrialDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTrial} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Trial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
