interface Props {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}

export default function FormField({ label, required, help, children }: Props) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {help && <p className="text-sm text-gray-500 mt-1">{help}</p>}
    </div>
  );
}
