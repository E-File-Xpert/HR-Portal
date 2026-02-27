import React from 'react';

export interface SmartCommandProps {
  onUpdate: () => void;
}

/**
 * Deprecated feature shim.
 *
 * The AI Smart Log UI was removed from the product, but this file remains so
 * old branches that still import it do not fail during build/merge.
 */
const SmartCommand: React.FC<SmartCommandProps> = () => null;

export default SmartCommand;
