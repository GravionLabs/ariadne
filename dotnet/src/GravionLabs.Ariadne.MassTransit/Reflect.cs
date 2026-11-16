using System;
using System.Reflection;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// Reads what MassTransit keeps in private members: the schedule of an activity and its name and delay, the request of a
/// request activity. The members exist in 8.x and 9.x; a test fails when one is renamed.
/// </summary>
internal static class Reflect
{
    private const BindingFlags All = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    /// <summary>A field of the object or of one of its base classes.</summary>
    internal static object? Field(object? instance, string name)
    {
        for (var type = instance?.GetType(); type is not null; type = type.BaseType)
        {
            var field = type.GetField(name, All | BindingFlags.DeclaredOnly);
            if (field is not null)
            {
                return field.GetValue(instance);
            }
        }

        return null;
    }

    /// <summary>A property that can be read, of the object or of one of its base classes or interfaces.</summary>
    internal static object? Property(object? instance, string name)
    {
        var type = instance?.GetType();
        if (type is null)
        {
            return null;
        }

        var property = type.GetProperty(name, All);
        if (property is null || !property.CanRead)
        {
            foreach (var contract in type.GetInterfaces())
            {
                var found = contract.GetProperty(name, All);
                if (found is not null && found.CanRead)
                {
                    property = found;
                    break;
                }
            }
        }

        return property is not null && property.CanRead && property.GetIndexParameters().Length == 0 ? property.GetValue(instance) : null;
    }
}
