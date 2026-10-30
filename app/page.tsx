import { redirect } from 'next/navigation';

/** The landing page is the operations platform; the customer e-services portal lives under /e-services. */
export default function Home() {
  redirect('/admin/login');
}
