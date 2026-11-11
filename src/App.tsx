import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { Icon } from './components/Icon';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) {
    return (
      <div className="splash">
        <span className="logo-mark big pulse">
          <Icon name="logo" size={30} />
        </span>
      </div>
    );
  }
  return user ? <Dashboard key={user.uid} user={user} /> : <Login />;
}
