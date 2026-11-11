import { useState } from 'react';
import { faviconOf, hostOf } from '../lib/utils';

export function Favicon({ url, size = 20 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  if (failed) {
    return (
      <span className="favicon fallback" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {host.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className="favicon"
      src={faviconOf(url)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
