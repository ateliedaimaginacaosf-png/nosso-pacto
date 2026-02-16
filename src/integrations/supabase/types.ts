export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      configuracao_familia: {
        Row: {
          consequencias_naturais: string[] | null
          created_at: string
          familia_id: string
          id: string
          limite_resgate_diario: number
          regras_ouro: string[] | null
          resgate_imediato: boolean
          updated_at: string
        }
        Insert: {
          consequencias_naturais?: string[] | null
          created_at?: string
          familia_id: string
          id?: string
          limite_resgate_diario?: number
          regras_ouro?: string[] | null
          resgate_imediato?: boolean
          updated_at?: string
        }
        Update: {
          consequencias_naturais?: string[] | null
          created_at?: string
          familia_id?: string
          id?: string
          limite_resgate_diario?: number
          regras_ouro?: string[] | null
          resgate_imediato?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_familia_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: true
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
        ]
      }
      familia: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      notificacao: {
        Row: {
          created_at: string
          familia_id: string
          id: string
          lida: boolean
          mensagem: string | null
          referencia_id: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacao"]
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          familia_id: string
          id?: string
          lida?: boolean
          mensagem?: string | null
          referencia_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacao"]
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          familia_id?: string
          id?: string
          lida?: boolean
          mensagem?: string | null
          referencia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacao"]
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          familia_id: string
          foto_url: string | null
          id: string
          nome: string
          saldo_moedas: number
          tipo_perfil: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          familia_id: string
          foto_url?: string | null
          id?: string
          nome: string
          saldo_moedas?: number
          tipo_perfil: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          familia_id?: string
          foto_url?: string | null
          id?: string
          nome?: string
          saldo_moedas?: number
          tipo_perfil?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
        ]
      }
      recompensa: {
        Row: {
          ativa: boolean
          created_at: string
          custo_moedas: number
          descricao: string | null
          exige_aprovacao: boolean
          familia_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          custo_moedas?: number
          descricao?: string | null
          exige_aprovacao?: boolean
          familia_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          custo_moedas?: number
          descricao?: string | null
          exige_aprovacao?: boolean
          familia_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recompensa_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
        ]
      }
      resgate_recompensa: {
        Row: {
          aprovado_por: string | null
          created_at: string
          crianca_id: string
          custo_moedas: number
          familia_id: string
          id: string
          recompensa_id: string
          status: Database["public"]["Enums"]["status_resgate"]
          updated_at: string
        }
        Insert: {
          aprovado_por?: string | null
          created_at?: string
          crianca_id: string
          custo_moedas: number
          familia_id: string
          id?: string
          recompensa_id: string
          status?: Database["public"]["Enums"]["status_resgate"]
          updated_at?: string
        }
        Update: {
          aprovado_por?: string | null
          created_at?: string
          crianca_id?: string
          custo_moedas?: number
          familia_id?: string
          id?: string
          recompensa_id?: string
          status?: Database["public"]["Enums"]["status_resgate"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resgate_recompensa_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resgate_recompensa_recompensa_id_fkey"
            columns: ["recompensa_id"]
            isOneToOne: false
            referencedRelation: "recompensa"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa: {
        Row: {
          atribuida_a: string | null
          categoria: Database["public"]["Enums"]["categoria_tarefa"]
          comentario_responsavel: string | null
          created_at: string
          criada_por: string
          data_aprovacao: string | null
          data_conclusao: string | null
          data_prevista: string | null
          descricao: string | null
          familia_id: string
          foto_comprovacao: string | null
          id: string
          justificativa: string | null
          nome: string
          periodicidade: Database["public"]["Enums"]["periodicidade_tarefa"]
          status: Database["public"]["Enums"]["status_tarefa"]
          tarefa_recorrente_id: string | null
          updated_at: string
          valor_moedas: number
        }
        Insert: {
          atribuida_a?: string | null
          categoria?: Database["public"]["Enums"]["categoria_tarefa"]
          comentario_responsavel?: string | null
          created_at?: string
          criada_por: string
          data_aprovacao?: string | null
          data_conclusao?: string | null
          data_prevista?: string | null
          descricao?: string | null
          familia_id: string
          foto_comprovacao?: string | null
          id?: string
          justificativa?: string | null
          nome: string
          periodicidade?: Database["public"]["Enums"]["periodicidade_tarefa"]
          status?: Database["public"]["Enums"]["status_tarefa"]
          tarefa_recorrente_id?: string | null
          updated_at?: string
          valor_moedas?: number
        }
        Update: {
          atribuida_a?: string | null
          categoria?: Database["public"]["Enums"]["categoria_tarefa"]
          comentario_responsavel?: string | null
          created_at?: string
          criada_por?: string
          data_aprovacao?: string | null
          data_conclusao?: string | null
          data_prevista?: string | null
          descricao?: string | null
          familia_id?: string
          foto_comprovacao?: string | null
          id?: string
          justificativa?: string | null
          nome?: string
          periodicidade?: Database["public"]["Enums"]["periodicidade_tarefa"]
          status?: Database["public"]["Enums"]["status_tarefa"]
          tarefa_recorrente_id?: string | null
          updated_at?: string
          valor_moedas?: number
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_tarefa_recorrente_id_fkey"
            columns: ["tarefa_recorrente_id"]
            isOneToOne: false
            referencedRelation: "tarefa_recorrente"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_interacao: {
        Row: {
          created_at: string
          familia_id: string
          foto_url: string | null
          id: string
          mensagem: string | null
          status_anterior: string | null
          status_novo: string
          tarefa_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          familia_id: string
          foto_url?: string | null
          id?: string
          mensagem?: string | null
          status_anterior?: string | null
          status_novo: string
          tarefa_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          familia_id?: string
          foto_url?: string | null
          id?: string
          mensagem?: string | null
          status_anterior?: string | null
          status_novo?: string
          tarefa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_interacao_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_interacao_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_padrao: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_tarefa"]
          created_at: string
          criada_por: string
          descricao: string | null
          familia_id: string
          id: string
          nome: string
          updated_at: string
          valor_moedas: number
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_tarefa"]
          created_at?: string
          criada_por: string
          descricao?: string | null
          familia_id: string
          id?: string
          nome: string
          updated_at?: string
          valor_moedas?: number
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_tarefa"]
          created_at?: string
          criada_por?: string
          descricao?: string | null
          familia_id?: string
          id?: string
          nome?: string
          updated_at?: string
          valor_moedas?: number
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_padrao_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_recorrente: {
        Row: {
          ativa: boolean
          atribuida_a: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          dias_semana: number[] | null
          familia_id: string
          id: string
          periodicidade: Database["public"]["Enums"]["periodicidade_tarefa"]
          tarefa_padrao_id: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          atribuida_a: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dias_semana?: number[] | null
          familia_id: string
          id?: string
          periodicidade?: Database["public"]["Enums"]["periodicidade_tarefa"]
          tarefa_padrao_id: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          atribuida_a?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dias_semana?: number[] | null
          familia_id?: string
          id?: string
          periodicidade?: Database["public"]["Enums"]["periodicidade_tarefa"]
          tarefa_padrao_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_recorrente_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_recorrente_tarefa_padrao_id_fkey"
            columns: ["tarefa_padrao_id"]
            isOneToOne: false
            referencedRelation: "tarefa_padrao"
            referencedColumns: ["id"]
          },
        ]
      }
      transacao: {
        Row: {
          created_at: string
          descricao: string | null
          familia_id: string
          id: string
          quantidade_moedas: number
          referencia_id: string | null
          saldo_anterior: number
          saldo_posterior: number
          tipo: Database["public"]["Enums"]["tipo_transacao"]
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          familia_id: string
          id?: string
          quantidade_moedas: number
          referencia_id?: string | null
          saldo_anterior?: number
          saldo_posterior?: number
          tipo: Database["public"]["Enums"]["tipo_transacao"]
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          familia_id?: string
          id?: string
          quantidade_moedas?: number
          referencia_id?: string | null
          saldo_anterior?: number
          saldo_posterior?: number
          tipo?: Database["public"]["Enums"]["tipo_transacao"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transacao_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familia"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_saldo: { Args: { _user_id: string }; Returns: number }
      get_user_familia_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_family_member: {
        Args: { _familia_id: string; _user_id: string }
        Returns: boolean
      }
      verificar_limite_diario: {
        Args: { _familia_id: string; _user_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "responsavel" | "crianca"
      categoria_tarefa:
        | "limpeza"
        | "estudos"
        | "exercicio"
        | "higiene"
        | "alimentacao"
        | "organizacao"
        | "outros"
      periodicidade_tarefa: "diaria" | "semanal" | "quinzenal" | "mensal"
      status_resgate: "pendente" | "aprovada" | "rejeitada" | "revertida"
      status_tarefa:
        | "a_fazer"
        | "pendente_aprovacao"
        | "concluida"
        | "rejeitada"
        | "arquivada"
        | "dispensa_solicitada"
      tipo_notificacao:
        | "tarefa_concluida"
        | "tarefa_aprovada"
        | "tarefa_rejeitada"
        | "resgate_solicitado"
        | "resgate_aprovado"
        | "resgate_rejeitado"
        | "resgate_revertido"
        | "nova_tarefa"
        | "bonus_recebido"
        | "penalidade_recebida"
      tipo_transacao:
        | "ganho_tarefa"
        | "resgate_recompensa"
        | "bonus"
        | "penalidade"
        | "reversao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["responsavel", "crianca"],
      categoria_tarefa: [
        "limpeza",
        "estudos",
        "exercicio",
        "higiene",
        "alimentacao",
        "organizacao",
        "outros",
      ],
      periodicidade_tarefa: ["diaria", "semanal", "quinzenal", "mensal"],
      status_resgate: ["pendente", "aprovada", "rejeitada", "revertida"],
      status_tarefa: [
        "a_fazer",
        "pendente_aprovacao",
        "concluida",
        "rejeitada",
        "arquivada",
        "dispensa_solicitada",
      ],
      tipo_notificacao: [
        "tarefa_concluida",
        "tarefa_aprovada",
        "tarefa_rejeitada",
        "resgate_solicitado",
        "resgate_aprovado",
        "resgate_rejeitado",
        "resgate_revertido",
        "nova_tarefa",
        "bonus_recebido",
        "penalidade_recebida",
      ],
      tipo_transacao: [
        "ganho_tarefa",
        "resgate_recompensa",
        "bonus",
        "penalidade",
        "reversao",
      ],
    },
  },
} as const
