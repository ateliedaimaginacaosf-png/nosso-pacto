import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface InteracaoInputProps {
  label?: string;
  placeholder?: string;
  mensagem: string;
  onMensagemChange: (v: string) => void;
  foto: File | null;
  onFotoChange: (f: File | null) => void;
  required?: boolean;
}

export function InteracaoInput({
  label = "Mensagem (opcional)",
  placeholder = "Escreva uma mensagem...",
  mensagem,
  onMensagemChange,
  foto,
  onFotoChange,
  required = false,
}: InteracaoInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    onFotoChange(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>{label}{required && " *"}</Label>
        <Textarea
          placeholder={placeholder}
          value={mensagem}
          onChange={(e) => onMensagemChange(e.target.value)}
        />
      </div>
      <div>
        <Label>Foto (opcional)</Label>
        <div className="flex items-center gap-2 mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1"
          >
            <Camera className="h-4 w-4" />
            {foto ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {foto && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                {foto.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onFotoChange(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {foto && (
          <div className="mt-2">
            <img
              src={URL.createObjectURL(foto)}
              alt="Preview"
              className="h-20 w-20 rounded-md object-cover border"
            />
          </div>
        )}
      </div>
    </div>
  );
}
