import { NavigationMenu } from '../components/NavigationMenu';

const Contact = () => {
  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
        <NavigationMenu />
      </header>
      <main className="w-full max-w-4xl px-4 py-10 text-center">
        <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
        <p className="text-lg mb-2">If you have any questions, feel free to reach out to us:</p>
        <p className="text-lg mb-2">
          <strong>Email:</strong> <a href="mailto:virtualnurselabcmu@gmail.com" className="text-blue-500">virtualnurselabcmu@gmail.com</a>
        </p>
        <p className="text-lg">
          <strong>Phone:</strong> <a href="tel:0987654321" className="text-blue-500">098-765-4321</a>
        </p>
      </main>
    </div>
  );
};

export default Contact;
