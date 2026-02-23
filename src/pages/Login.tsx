import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import logoImg from "@/assets/logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao entrar",
        description: error.message === "Invalid login credentials"
          ? "Email ou senha incorretos."
          : error.message === "Email not confirmed"
          ? "Verifique seu email antes de fazer login."
          : error.message,
      });
    } else {
      // Redirect handled by App router based on role
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "");

      const roles = (rolesData || []).map((r: any) => r.role);
      if (roles.includes("admin")) {
        navigate("/admin");
      } else if (roles.includes("crianca")) {
        navigate("/crianca");
      } else {
        navigate("/responsavel");
      }
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ variant: "destructive", title: "Digite seu email primeiro" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } else {
      toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center"
          >
            <img src={logoImg} alt="Nosso Pacto" className="h-16 w-16 rounded-2xl object-cover" />
          </motion.div>
          <h1 className="font-display text-3xl font-bold text-foreground">Nosso Pacto</h1>
          <p className="mt-1 text-muted-foreground">Combinados em família, crescimento com autonomia 🤝</p>
        </div>

        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="font-display text-xl">Entrar</CardTitle>
            <CardDescription>Use seu email e senha para acessar</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox id="remember" defaultChecked />
                  <span className="text-sm text-muted-foreground">Lembrar de mim</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-primary hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                <LogIn className="h-4 w-4" />
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Não tem conta?{" "}
                <Link to="/registro" className="font-semibold text-primary hover:underline">
                  Criar conta
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
