import { FaEnvelope } from 'react-icons/fa';

const Contact = () => {
  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
      </header>
      <main className="w-full max-w-4xl px-4 py-10 text-center">
        <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
        <p className="text-lg mb-6">If you have any questions, feel free to reach out to us:</p>
        <div className="bg-white p-6 rounded-lg shadow-lg mb-6 relative">
          <div className="absolute -top-3 -right-3 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-md">
            Free trial available!
          </div>
          <div className="flex flex-col items-center justify-center mb-4">
            <img src="https://qr-official.line.me/gs/M_708uxghy_GW.png?oat_content=qr" alt="QR Code" className="mb-4 w-32 h-32" />
            <h2 className="text-lg font-bold mb-4">@708uxghy (อย่าลืม@)</h2>
            <div className="flex items-center justify-center mb-4">
              <FaEnvelope className="text-blue-500 mr-2" size={24} />
              <a href="mailto:virtualnurselabcmu@gmail.com" className="text-lg text-blue-500 hover:underline">virtualnurselab@gmail.com</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Contact;