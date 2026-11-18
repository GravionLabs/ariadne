using System.Reflection;
static class Explore {
  public static void Types(params Type[] ts) {
    foreach (var t in ts) {
      Console.WriteLine($"== {t.FullName}");
      foreach (var m in t.GetMembers(BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.DeclaredOnly)) Console.WriteLine("  "+m);
    }
  }
}
