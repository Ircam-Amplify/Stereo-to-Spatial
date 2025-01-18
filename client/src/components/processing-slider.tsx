import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Volume2 } from "lucide-react";

const intensityLevels = [
  { value: "1", label: "Subtle", size: "h-5 w-5" },
  { value: "2", label: "Gentle", size: "h-[1.35rem] w-[1.35rem]" },
  { value: "3", label: "Medium", size: "h-6 w-6" },
  { value: "4", label: "Intense", size: "h-[1.6rem] w-[1.6rem]" },
  { value: "5", label: "Maximum", size: "h-7 w-7" },
];

interface ProcessingSliderProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProcessingSlider({ value, onChange }: ProcessingSliderProps) {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Volume2 
            className="h-6 w-6 text-primary transition-transform duration-300 ease-out" 
            style={{
              transform: `scale(${1 + (parseInt(value) - 1) * 0.1})`
            }}
          />
          <h3 className="font-medium text-lg">Processing Intensity</h3>
        </div>
        <RadioGroup
          value={value}
          onValueChange={onChange}
          className="grid grid-cols-5 gap-4"
        >
          {intensityLevels.map((level) => (
            <div 
              key={level.value} 
              className="flex flex-col items-center space-y-2"
              style={{
                transform: `scale(${0.9 + (parseInt(level.value) * 0.05)})`,
                transition: 'transform 0.2s ease'
              }}
            >
              <RadioGroupItem
                value={level.value}
                id={`intensity-${level.value}`}
                className={level.size}
              />
              <Label
                htmlFor={`intensity-${level.value}`}
                className={`text-sm text-center cursor-pointer font-medium
                  ${value === level.value ? 'text-primary' : 'text-muted-foreground'}
                  transition-colors duration-200`}
                style={{
                  fontSize: `${0.8 + (parseInt(level.value) * 0.025)}rem`
                }}
              >
                {level.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </Card>
  );
}