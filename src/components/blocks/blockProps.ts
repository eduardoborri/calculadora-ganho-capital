import type { CaseInput, CaseResult } from "../../types";

// Every block reads the single CaseInput of the calculator and sends back a partial patch.
export interface BlockProps {
  input: CaseInput;
  onChange: (patch: Partial<CaseInput>) => void;
}

// Blocks that also show what the engine found (exemption reasons, reinvestment deadline).
export interface BlockWithResultProps extends BlockProps {
  result: CaseResult;
}
