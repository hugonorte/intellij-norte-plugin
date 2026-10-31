using System;
using System.Collections.Generic;

namespace Norte.Samples
{
    /// <summary>A simple service.</summary>
    [Serializable]
    public sealed class Greeter : IGreeter
    {
        #region Fields
        private const int MaxNames = 10;
        private readonly List<string> _names = new();
        #endregion

        public event EventHandler? Greeted;

        public string Greet(string name, bool shout = false)
        {
            if (string.IsNullOrEmpty(name)) throw new ArgumentException("empty", nameof(name));
            var message = $"Hello, {name}! ({_names.Count}/{MaxNames})";
            _names.Add(name);
            Greeted?.Invoke(this, EventArgs.Empty);
            return shout ? message.ToUpperInvariant() : message; // comment
        }
    }
}
