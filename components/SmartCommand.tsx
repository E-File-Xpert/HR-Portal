import React from 'react';

interface SmartCommandProps {
  onUpdate: () => void;
}

/**
 * Compatibility shim: Smart Log feature has been removed.
 * Keeping this component avoids merge/deploy breakage if older branches still import it.
 */
const SmartCommand: React.FC<SmartCommandProps> = () => null;

export default SmartCommand;
