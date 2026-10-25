'use client';

import { useRef, useState, useEffect } from 'react';
import { useOptionalWallet, useWallet } from './WalletProvider';
import { site } from '@/lib/site';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

/** Renders nothing outside a WalletProvider (e.g. isolated component tests). */
export function WalletButton() {
  return useOptionalWallet() ? <WalletButtonMenu /> : null;
}

function WalletButtonMenu() {
  const { state, connect, disconnect } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopyAddress = async () => {
    if (state.type === 'connected' || state.type === 'wrong-network') {
      await navigator.clipboard.writeText(state.address);
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        menuRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (state.type === 'unavailable') {
    return (
      <a
        href="https://freighter.app"
        target="_blank"
        rel="noreferrer"
        className="btn btn-secondary btn-sm"
        style={{ marginLeft: 8 }}
      >
        Install Freighter
      </a>
    );
  }

  if (state.type === 'disconnected') {
    return (
      <button
        className="btn btn-primary btn-sm"
        onClick={connect}
        style={{ marginLeft: 8 }}
      >
        Connect wallet
      </button>
    );
  }

  if (state.type === 'connecting') {
    return (
      <button
        className="btn btn-primary btn-sm"
        disabled
        style={{ marginLeft: 8 }}
      >
        Connecting…
      </button>
    );
  }

  if (state.type === 'error') {
    return (
      <button
        className="btn btn-secondary btn-sm"
        onClick={connect}
        style={{ marginLeft: 8 }}
        title={state.message}
      >
        Connect wallet
      </button>
    );
  }

  const address = state.type === 'connected' || state.type === 'wrong-network' ? state.address : '';
  const explorerLink = `https://stellar.expert/explorer/${site.network}/account/${address}`;

  return (
    <div style={{ position: 'relative', marginLeft: 8 }}>
      <button
        ref={buttonRef}
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {short(address)}
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="menu-panel"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            minWidth: 200,
            zIndex: 1000,
          }}
          onKeyDown={handleKeyDown}
          role="menu"
        >
          <button
            className="menu-item"
            onClick={handleCopyAddress}
            role="menuitem"
            tabIndex={0}
          >
            Copy address
          </button>
          <a
            href={explorerLink}
            target="_blank"
            rel="noreferrer"
            className="menu-item"
            role="menuitem"
            tabIndex={0}
          >
            View on stellar.expert
          </a>
          <button
            className="menu-item"
            onClick={handleDisconnect}
            role="menuitem"
            tabIndex={0}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
